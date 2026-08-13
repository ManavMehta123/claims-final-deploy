# Continuous Learning Pipeline

Application Epic — *Continuous Learning Pipeline (Story)*

This document describes how the Claim Prediction Model stays up to date
with real outcomes instead of being frozen at its original training
snapshot, and how a bad retrain can always be undone.

## 1. Why

The Claim Prediction Model (Story 6) was trained once, offline, on the
1,399-row "Fast & Furious Insured" seed dataset. Every day the Claims
Management System is used, admins approve or reject real claims — each
decision is a new, ground-truth labeled example the model has never
seen. Without a pipeline to bring that data back into training, the
model's accuracy on real usage patterns can only get stale, never
improve.

This story adds four things:

| Deliverable | Where |
|---|---|
| Automated data ingestion | `backend/src/controllers/mlExportController.js` + `ml-service/ingestion/ingest.py` |
| Airflow (mandatory) | `ml-service/airflow/dags/*.py`, `ml-service/airflow/Dockerfile`, Airflow services in `docker-compose.yml` |
| Documented retraining process | This document |
| Model versioning & rollback | `ml-service/registry.py`, `ml-service/rollback.py`, `/model/versions` & `/model/rollback` on ml-service |

## 2. End-to-end flow

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                     Airflow (scheduled)                  │
                 │                                                         │
   daily 02:00   │   data_ingestion_dag                                    │
   ────────────► │     1. ingest_new_claims  ──► triggers ──┐              │
                 │                                          │              │
   weekly 03:00  │   continuous_retraining_dag  ◄───────────┘              │
   (safety net)  │     1. train_challenger                                 │
   ────────────► │     2. evaluate_and_promote                             │
                 │     3. reload_serving_model                             │
                 └─────────────────────────────────────────────────────────┘
                         │                    │                    │
                         ▼                    ▼                    ▼
      GET /api/ml/training-export   train.py trains a new    POST /model/reload
      (backend, admin JWT)          version into              on ml-service
      → resolved claims since       artifacts/versions/<v>/
        last watermark              (registry.py)
                         │
                         ▼
      ml-service/data/live_feedback.csv
      (unioned with the seed dataset on every training run)
```

Two DAGs, not one, so ingestion and retraining can be reasoned about
(and re-run, and fail) independently:

- **`data_ingestion_dag`** — pulls new labeled examples and stops. It
  triggers `continuous_retraining_dag` on success, so a batch of newly
  ingested claims becomes an immediate retraining opportunity rather than
  waiting for the next calendar slot.
- **`continuous_retraining_dag`** — trains, evaluates, and (maybe)
  promotes. It also runs on its own weekly schedule as a safety net in
  case it was triggered-but-skipped for some reason (e.g. Airflow was
  down when ingestion finished).

## 3. Data ingestion

**Source.** Rather than a synthetic external feed, ingestion pulls from
the system's own ground truth: claims an admin has already decided
(`status: Approved` or `Rejected`). `GET /api/ml/training-export` (admin
JWT required, stateful/MongoDB mode only) joins each such claim with its
policy to recover an `Expiry_date` (the policy's `endDate` — the same
field the original seed dataset's `Expiry_date` represents), and maps
`Approved → Condition=1` / `Rejected → Condition=0`, `amountClaimed →
Amount` (only when approved).

**Incremental watermark.** `ml-service/data/ingestion_state.json` stores
`last_ingested_at`, the `decidedAt` of the most recently ingested claim.
Every run only asks the backend for claims decided after that point
(`?since=`), so re-running ingestion is cheap and doesn't reprocess the
whole claims table.

**Validation.** `ingest.py::validate_row()` rejects a row (rather than
letting it reach training data) if: the insurer code is unrecognized,
`Cost_of_vehicle`/`Min_coverage`/`Max_coverage` is missing or negative,
`Min_coverage > Max_coverage`, `Expiry_date` couldn't be resolved (e.g.
the linked policy was deleted), `Condition` isn't 0/1, or an approved
claim is missing a valid `Amount`. Rejected rows are recorded (with a
reason) in the run's result and in `ingestion_state.json`'s run history,
not silently dropped.

**Storage.** Valid rows are written to a dated, append-only audit file
under `ml-service/data/incoming/batch_<timestamp>.csv`, and merged
(deduplicated by `claimId`) into `ml-service/data/live_feedback.csv`.

**Service credentials.** The ingestion job authenticates as a dedicated
admin account rather than embedding a long-lived token — backend JWTs
expire in 1 hour (`JWT_EXPIRES_IN`, see `backend/src/config/auth.js`),
shorter than the gap between scheduled runs. Set `INGESTION_USERNAME` /
`INGESTION_PASSWORD` (an admin login) as environment variables on the
Airflow containers before `docker compose up`; `INGESTION_JWT` remains
available as a manual override (e.g. for ad-hoc `--dry-run` testing).

## 4. Retraining

`train.py::train()` loads the seed dataset (`data/train.csv`) unioned
with `data/live_feedback.csv` (if it exists — a fresh clone with no
ingested data yet still trains successfully on the seed alone), applies
the same feature engineering and two-stage Random Forest architecture as
the original model (condition classifier + amount regressor, see
`docs/Claim_Prediction_Model_EDA_Accuracy_Report.docx` for that
methodology), and writes the result to a **new** version folder rather
than overwriting anything:

```
artifacts/
  registry.json
  versions/
    v20260807-020000/
      condition_classifier.joblib
      amount_regressor.joblib
      metrics.json
  condition_classifier.joblib   <- copy of whichever version is "current"
  amount_regressor.joblib
  metrics.json
```

Called with `promote=False` (what the DAG uses), the new version is
registered as a `challenger` and nothing about the live model changes.
Called with `promote=True` (the default for a manual `python train.py`,
e.g. after intentionally adding a large new batch of labeled data), it
also immediately becomes `current`.

## 5. Evaluation & promotion gate

A challenger is only as useful as the confidence that it isn't a
regression. `evaluate_and_promote.py` compares the challenger's metrics
against the current champion's:

- `condition_f1` may not drop by more than **0.01**
- `amount_r2` may not drop by more than **0.02**

Both must hold; if either is violated, the challenger is left in the
registry (status `challenger`, inspectable, and still manually
promotable later) and the champion keeps serving. If there is no current
champion yet (first-ever training run), the challenger is promoted
unconditionally. This was exercised directly during development: a
challenger trained on a small, deliberately unrepresentative
live-feedback sample was correctly **rejected** for an `amount_r2` drop,
and the pre-existing model kept serving.

On promotion, `reload_serving_model` (the DAG's last task) calls `POST
/model/reload` on the running ml-service container, so the new champion
starts serving immediately — no container restart needed.

## 6. Model versioning & rollback

Every trained version — promoted or not — stays on disk indefinitely
under `artifacts/versions/`, and every promotion/rollback is a metadata
change plus a small file copy (`registry.promote_version`), never a
retrain. That gives two independent ways to roll back:

**Via the running service:**
```
GET  /model/versions             # list every trained version + current metrics
POST /model/rollback {"version": "v20260807-020000"}
```

**Via CLI, independent of the service being healthy** (e.g. the newly
promoted model is causing errors and you don't trust the API layer):
```
python rollback.py list
python rollback.py rollback v20260807-020000
```

Both paths call the same `registry.rollback_to()`, which is literally
`promote_version()` under a name that describes the operator's intent —
promoting a challenger and rolling back to a previous champion are the
same operation in either direction.

## 7. Running it locally

```bash
# one-off manual retrain + auto-promote (no Airflow needed)
cd ml-service
python train.py

# train a challenger without promoting, then decide manually
python train.py --no-promote --version manual-test-1
python evaluate_and_promote.py manual-test-1

# inspect / roll back
python rollback.py list
python rollback.py rollback <version>

# ingestion (needs the backend running with USE_DB=true, and an admin login)
export BACKEND_URL=http://localhost:8080
export INGESTION_USERNAME=admin
export INGESTION_PASSWORD=<seeded admin password>
python ingestion/ingest.py --dry-run   # validate only, write nothing
python ingestion/ingest.py             # normal incremental run
```

Full stack, including Airflow:
```bash
export INGESTION_USERNAME=admin
export INGESTION_PASSWORD=<seeded admin password>
docker compose up --build
# Airflow UI: http://localhost:8081  (admin / admin — seeded by airflow-init)
```

## 8. Design decisions & trade-offs

- **Feedback source is the system's own decided claims, not a separate
  external feed.** This keeps the pipeline demonstrable end-to-end
  without inventing a fake upstream data source, and mirrors how a real
  insurer's MLOps loop actually works: today's predictions and
  adjudications become tomorrow's training data.
- **Two DAGs instead of one.** Ingestion and retraining fail for
  different reasons (a flaky backend call vs. a training bug) and are
  useful to re-run independently; chaining them via
  `TriggerDagRunOperator` keeps the "ingest → maybe retrain" causality
  without merging their failure/retry semantics.
- **Tolerance-based promotion, not "loss must monotonically improve."**
  A live-feedback batch can be small and noisy; a strict
  "must-be-strictly-better" rule would make promotions rare and brittle.
  The tolerance bands (§5) were chosen to allow small statistical noise
  through while still catching a genuinely worse model — exactly what
  the rejected-challenger test in §5 demonstrates.
- **Registry is a flat JSON file, not a database.** The registry only
  needs to be read/written by the training/evaluation scripts and the
  Flask service, all on the same shared volume; a JSON file with an
  atomic write (`os.replace`) is simpler to reason about and inspect by
  hand than adding another datastore for a component this small.
