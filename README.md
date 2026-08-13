# Claims Management System — Story 1 + Story 2 + Story 3 + Story 4 + Story 5 + Story 6

Backend (Node/Express) + Frontend (React/Vite). The backend can run two ways, switched by
one environment variable (`USE_DB`):

- **Stateless (`USE_DB=false`, default):** in-memory data structures. Data resets when the
  backend restarts. Matches the original Story 1 requirement exactly.
- **Stateful (`USE_DB=true`):** MongoDB-backed persistence via Mongoose. Data survives
  restarts. Matches Story 2, "Upgrade Claims Management System to Stateful application".

Both modes expose the **identical** API contract (same routes, request/response shapes,
validation, and business-rule error codes) — see `docs/DATABASE_CHOICE.md` for how that's
achieved via the repository pattern.

## Entities

| Entity | Key fields |
|---|---|
| **Policyholder** | name, email (unique), phone, address, dateOfBirth |
| **Policy** | policyNumber (unique), policyholderId, type, coverageAmount, premiumAmount, startDate, endDate, status |
| **Claim** | claimNumber (unique), policyId, amountClaimed, dateOfClaim, description, status |

## Business rules enforced

1. A policyholder's email must be unique.
2. A policy's `endDate` must be after its `startDate`.
3. A claim can only be filed against a policy with `status = Active`.
4. The sum of all non-rejected claims against a policy cannot exceed that policy's
   `coverageAmount` (a `422` response includes the remaining coverage when violated).
5. A policyholder can't be deleted while they still have policies; a policy can't be
   deleted while it still has claims.

## Run it

### Option A — Stateless (in-memory)

**Terminal 1 — backend:**
```bash
cd backend
npm install
cp .env.example .env
npm start
```
You should see `Claims Management API listening on port 5000 [STATELESS/in-memory]`. Leave it running.

**Terminal 2 — frontend:**
```bash
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (usually `http://localhost:5173`).

Both need to be running at the same time — the frontend calls the backend over `/api`.

### Option B — Stateful (MongoDB)

1. Get a MongoDB connection string — either run one locally (`mongod` on
   `mongodb://127.0.0.1:27017`) or create a free cluster on
   [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and copy its connection string.
2. In `backend/.env`, set:
   ```bash
   USE_DB=true
   MONGO_URI=mongodb://127.0.0.1:27017/claims_management
   ```
3. (Optional) seed some sample data and sync indexes:
   ```bash
   cd backend
   node scripts/seed.js
   ```
4. Start the backend as usual (`npm start`). You should see
   `Claims Management API listening on port 5000 [STATEFUL/MongoDB]` and a
   `MongoDB connected -> claims_management` log line.
5. Restart the backend and confirm `GET /api/policyholders` still returns previously
   created records — that's the proof persistence is working.

The frontend needs **no changes** to work against either mode.

## Story 3 — API security & documentation

Every `/api/*` route now requires a JWT, and the whole API sits behind an Nginx gateway. See
**`docs/API_SECURITY.md`** for the full design writeup, run instructions (Docker and non-Docker),
and viva Q&A. Quick version:

```bash
cd backend
cp .env.example .env
node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"   # paste into ADMIN_PASSWORD_HASH
cd ..
docker compose up --build
```
- Gateway: `http://localhost:8080` · Swagger UI: `http://localhost:8080/api-docs`
- `POST /api/auth/login` with `{ "username": "admin", "password": "yourpassword" }` returns a
  JWT; send it as `Authorization: Bearer <token>` on every other `/api/*` call.

> **Note for Story 4 (frontend):** because `/api/*` is now protected, the existing frontend
> pages need a login step added before they can call the API again — that's the first thing
> to build when picking Story 4 back up.

## Story 4 — Frontend (React)

The `frontend/` app now has a login screen wired to the Story 3 JWT backend. See
**`docs/FRONTEND.md`** for the full design writeup and viva Q&A. Quick version:

```bash
# Terminal 1
cd backend && npm start          # http://localhost:5000

# Terminal 2
cd frontend && npm install && npm run dev   # http://localhost:5173
```
Open `http://localhost:5173` — you'll be redirected to `/login`. Log in with your seeded admin
credentials; on success you land on the Policyholders page, and every API call now carries
your JWT automatically. An expired/invalid token anywhere in the app bounces you back to
`/login`.

**Deploying the frontend separately (CI/CD from Git):** `amplify.yml` at the project root is
an AWS Amplify build spec — connect this repo in the Amplify Console, it auto-detects
`amplify.yml`, and every push to your branch rebuilds and redeploys the frontend. Set
`VITE_API_BASE_URL` in the Amplify Console (App settings → Environment variables) to your
deployed backend/gateway URL, e.g. `https://your-backend-domain.com/api` — see
`frontend/.env.example`.

## Story 5 — Monitoring

The backend now exposes Prometheus metrics at `GET /metrics` (request rate, error rate,
latency histogram, in-flight requests, plus Node process/event-loop stats), and
`docker compose up --build` now also brings up Prometheus (`http://localhost:9090`) and a
Grafana dashboard (`http://localhost:3001`, login `admin`/`admin`) pre-loaded with a
**"Claims API Overview"** dashboard — no manual setup needed. See
**`docs/MONITORING.md`** for the full design writeup, PromQL examples, and viva Q&A.

## Story 6 — Claim Prediction Model + Deployment

A Flask ML microservice (`ml-service/`) trains and serves a two-stage model on the
"Fast & Furious Insured" claims dataset: a Random Forest **classifier** predicts whether a
policy will result in a claim, and a Random Forest **regressor** (trained only on claimed
policies) estimates the claim **Amount**. Training is tracked end-to-end with **MLflow**
(params + metrics + serialized artifacts, logged to a local SQLite store).

```bash
cd ml-service
pip install -r requirements.txt
python train.py          # writes artifacts/*.joblib + metrics.json, logs an MLflow run
python app.py             # serves on http://localhost:5001 (GET /health, POST /predict)
```

The Node backend proxies `POST /api/predict-claim` (JWT-protected) to this service, and the
frontend's **Predict Claim** page (`/predict-claim`) calls it and shows the estimated claim
likelihood and amount. `docker compose up --build` builds and starts `ml-service` alongside
everything else, wired via `ML_SERVICE_URL`.

See **`docs/Claim_Prediction_Model_EDA_Accuracy_Report.docx`** for the full EDA write-up,
model accuracy report, and viva Q&A — deliverables for both the "Claim Prediction Model" and
"Model Deployment and API" stories.

## Testing the API directly

Import `postman/Claims-Management-System.postman_collection.json` into Postman. Run the new
**Auth → Login** request first — its test script stores the JWT into a collection variable,
and every other request already sends it via `Authorization: Bearer {{jwtToken}}`. The
collection's `baseUrl` now defaults to the gateway (`http://localhost:8080`); switch it to
`http://localhost:5000` to bypass the gateway and hit Express directly.

## Docs

- `docs/LLD.docx` — full low-level design: entity model, layered architecture, validation
  rules, test cases, and a viva Q&A section.
- `docs/API_SECURITY.md` — Story 3 design writeup: Nginx gateway, JWT auth, Swagger docs, viva Q&A.
- `docs/FRONTEND.md` — Story 4 design writeup: auth flow, protected routes, deployment, viva Q&A.
- `docs/DATABASE_CHOICE.md` — why MongoDB, schema design, and how the repository pattern
  keeps both modes API-compatible.
- `docs/PR_DESCRIPTION.md` — the PR description for the stateless → stateful upgrade.
- `docs/DEPLOYMENT.md` — steps to deploy the stateful build to the cloud (Render + Atlas).
- `docs/Claim_Prediction_Model_EDA_Accuracy_Report.docx` — Story 6 design writeup: EDA
  findings, model accuracy report, deployment/MLflow summary, viva Q&A.
- `docs/MONITORING.md` — Story 5 design writeup: why monitoring matters, Prometheus +
  Grafana setup, metrics reference, PromQL examples, viva Q&A.
#   c l a i m s - m a n a g e m e n t - f u l l - l a n d i n g  
 #   c l a i m s - m a n a g e m e n t - f i n a l - d e p l o y  
 #   c l a i m s - f i n a l - d e p l o y  
 