"""
Automated data ingestion for the Continuous Learning Pipeline.

What it does, each run:
  1. Reads the ingestion watermark (timestamp of the last successfully
     ingested claim) from data/ingestion_state.json.
  2. Calls GET /api/ml/training-export?since=<watermark> on the backend
     (see backend/src/controllers/mlExportController.js), which returns
     every claim decided (Approved/Rejected) after that point, already
     shaped into the same feature/label columns train.py trains on.
  3. Validates each row (required fields present, values in sane ranges)
     and drops anything malformed rather than letting bad data poison the
     next retrain.
  4. Writes the valid rows to a dated batch file under data/incoming/ (an
     audit trail of every ingestion run) and appends them to
     data/live_feedback.csv, which train.py automatically unions with the
     seed dataset.
  5. Advances the watermark to the newest decidedAt it just ingested.

Safe to run repeatedly / concurrently-idempotent in the sense that a
re-run with the same watermark just re-fetches and re-validates the same
window; duplicate rows in live_feedback.csv are deduped by claimId before
being written.

Usage:
  python ingest.py                 # normal incremental run
  python ingest.py --since 2026-01-01T00:00:00Z   # override the watermark
  python ingest.py --dry-run       # fetch + validate only, write nothing
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

import pandas as pd
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "data")
INCOMING_DIR = os.path.join(DATA_DIR, "incoming")
LIVE_FEEDBACK_PATH = os.path.join(DATA_DIR, "live_feedback.csv")
STATE_PATH = os.path.join(DATA_DIR, "ingestion_state.json")

BACKEND_URL = os.environ.get("BACKEND_URL", "http://backend:5000")
# Backend JWTs expire in 1h (see backend/src/config/auth.js), which is
# shorter than the gap between scheduled ingestion runs — so rather than
# passing in one static long-lived token, this job logs in with a
# dedicated admin service account on every run and gets a fresh JWT.
# INGESTION_JWT is still supported as an override/escape hatch (e.g. for
# --dry-run testing against a backend where login isn't set up).
INGESTION_USERNAME = os.environ.get("INGESTION_USERNAME", "")
INGESTION_PASSWORD = os.environ.get("INGESTION_PASSWORD", "")
INGESTION_JWT = os.environ.get("INGESTION_JWT", "")


def _get_jwt():
    if INGESTION_JWT:
        return INGESTION_JWT
    if not (INGESTION_USERNAME and INGESTION_PASSWORD):
        raise IngestionError(
            "No credentials configured — set INGESTION_USERNAME/INGESTION_PASSWORD "
            "(an admin account) or INGESTION_JWT. See docs/CONTINUOUS_LEARNING.md "
            "'Service credentials'."
        )
    resp = requests.post(
        f"{BACKEND_URL}/api/auth/login",
        json={"username": INGESTION_USERNAME, "password": INGESTION_PASSWORD},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["token"]

TRAIN_COLUMNS = [
    "Insurance_company", "Cost_of_vehicle", "Min_coverage",
    "Max_coverage", "Expiry_date", "Condition", "Amount",
]

VALID_COMPANIES = {"A", "B", "C", "D"}  # matches the seed dataset's categories


class IngestionError(Exception):
    pass


def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"last_ingested_at": None, "runs": []}


def save_state(state):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_PATH)


def fetch_rows(since):
    token = _get_jwt()
    params = {"since": since} if since else {}
    resp = requests.get(
        f"{BACKEND_URL}/api/ml/training-export",
        params=params,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code == 501:
        raise IngestionError(
            "Backend is running in stateless (in-memory) mode; the "
            "Continuous Learning Pipeline needs USE_DB=true."
        )
    resp.raise_for_status()
    return resp.json()["rows"]


def validate_row(row):
    """Returns (is_valid, reason_if_invalid). Mirrors the sanity checks
    train.py implicitly assumes about the seed dataset, so bad rows never
    reach the training set."""
    if not row.get("claimId"):
        return False, "missing claimId"
    if row.get("Insurance_company") not in VALID_COMPANIES:
        return False, f"unrecognized Insurance_company {row.get('Insurance_company')!r}"
    for field in ("Cost_of_vehicle", "Min_coverage", "Max_coverage"):
        val = row.get(field)
        if val is None or val < 0:
            return False, f"{field} missing or negative"
    if row.get("Min_coverage") is not None and row.get("Max_coverage") is not None:
        if row["Min_coverage"] > row["Max_coverage"]:
            return False, "Min_coverage exceeds Max_coverage"
    if not row.get("Expiry_date"):
        return False, "missing Expiry_date (claim's policy could not be resolved)"
    condition = row.get("Condition")
    if condition not in (0, 1):
        return False, f"Condition must be 0 or 1, got {condition!r}"
    if condition == 1 and (row.get("Amount") is None or row.get("Amount") < 0):
        return False, "approved claim missing a valid Amount"
    return True, None


def run(since_override=None, dry_run=False):
    state = load_state()
    since = since_override or state.get("last_ingested_at")

    rows = fetch_rows(since)
    valid_rows, rejected = [], []
    for row in rows:
        ok, reason = validate_row(row)
        (valid_rows if ok else rejected).append(row if ok else {**row, "_reject_reason": reason})

    result = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "since": since,
        "fetched": len(rows),
        "valid": len(valid_rows),
        "rejected": len(rejected),
        "rejected_detail": rejected[:20],  # cap so state.json doesn't grow unbounded
    }

    if dry_run or not valid_rows:
        result["note"] = "dry-run: nothing written" if dry_run else "no new rows"
        print(json.dumps(result, indent=2))
        return result

    os.makedirs(INCOMING_DIR, exist_ok=True)
    batch_df = pd.DataFrame(valid_rows)[["claimId", *TRAIN_COLUMNS, "decidedAt"]]
    batch_path = os.path.join(INCOMING_DIR, f"batch_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.csv")
    batch_df.to_csv(batch_path, index=False)
    result["batch_file"] = os.path.relpath(batch_path, DATA_DIR)

    if os.path.exists(LIVE_FEEDBACK_PATH):
        existing = pd.read_csv(LIVE_FEEDBACK_PATH)
        combined = pd.concat([existing, batch_df], ignore_index=True)
    else:
        combined = batch_df
    combined = combined.drop_duplicates(subset="claimId", keep="last")
    combined.to_csv(LIVE_FEEDBACK_PATH, index=False)
    result["live_feedback_row_count"] = len(combined)

    newest_decided_at = max(r["decidedAt"] for r in valid_rows)
    state["last_ingested_at"] = newest_decided_at
    state.setdefault("runs", []).append(result)
    state["runs"] = state["runs"][-50:]  # keep the state file bounded
    save_state(state)

    print(json.dumps(result, indent=2))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", default=None, help="Override the stored watermark (ISO timestamp).")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate only; write nothing.")
    args = parser.parse_args()
    try:
        run(since_override=args.since, dry_run=args.dry_run)
    except IngestionError as e:
        print(f"Ingestion failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
