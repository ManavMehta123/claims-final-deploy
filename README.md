# Claims Management System

A full-stack insurance claims platform built with **React (Vite)**, **Node.js/Express**, and **MongoDB**, with a **Flask + scikit-learn** microservice for claim prediction. Secured with JWT auth behind an Nginx gateway, containerized with Docker, and monitored with Prometheus + Grafana.

## Features

- Manage policyholders, policies, and claims with full CRUD and business-rule validation (unique emails, coverage limits, active-policy checks, etc.)
- Configurable persistence — in-memory mode for quick demos, MongoDB-backed mode for production use, behind the same API contract
- JWT-authenticated REST API, documented with Swagger, routed through an Nginx gateway
- React frontend with protected routes and a login flow
- ML-powered claim prediction: a Random Forest model estimates claim likelihood and amount, tracked with MLflow and served via a Flask microservice, with automatic retraining on new labeled claims
- **Model governance**: every retrain is checked for data drift (Population Stability Index against the original training distribution) and model drift (regression in accuracy/F1/R² vs. the current champion), with a timestamped JSON + HTML report generated on every run
- Real-time monitoring with Prometheus metrics (request rate, error rate, p95 latency, event-loop lag, memory) and a pre-built Grafana dashboard
- CI/CD-ready frontend deployment via AWS Amplify

## Tech Stack

**Frontend:** React, Vite
**Backend:** Node.js, Express, MongoDB (Mongoose)
**ML Service:** Flask, scikit-learn, MLflow
**Infra:** Docker Compose, Nginx, Prometheus, Grafana

## Quick Start

```bash
docker compose up --build
```

- App: `http://localhost:8080`
- API docs (Swagger): `http://localhost:8080/api-docs`
- Prometheus: `http://127.0.0.1:9090`
- Grafana dashboard: `http://127.0.0.1:3001` (login `admin`/`admin`)

> **Note:** use `127.0.0.1`, not `localhost`, for Prometheus and Grafana — on some setups the browser fails to resolve `localhost` to these containers even though they're running and healthy.

For non-Docker setup, MongoDB configuration, and API testing via Postman, see `docs/`.

## Running Locally (without Docker)

Each service can also be run directly on your machine — useful for active development.

**Backend**
```bash
cd backend
npm install
npm run dev        # nodemon, auto-restarts on changes (npm start for plain node)
```
Copy `.env.example` to `.env` first. Runs on `http://localhost:5000` by default (`PORT` in `.env`; falls back to 5001/5002/5003 if taken). Set `USE_DB=false` for in-memory mode, or `USE_DB=true` + `MONGO_URI` for MongoDB. Set `ML_SERVICE_URL=http://localhost:5001` to point at your local ML service.

**Frontend**
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173` (Vite). Set `VITE_API_BASE_URL` (defaults to `http://localhost:5000`) if your backend isn't on the default port.

**ML Service**
```bash
cd ml-service
python -m venv venv
venv\Scripts\activate        # Windows; use source venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python train.py
python app.py
```
Runs on `http://localhost:5001` by default (`PORT` env var to override). Requires Python 3.11/3.12 — newer versions can hit numpy/pandas wheel compatibility issues.

## Model Governance

Every model retrain is checked for two kinds of drift before/after promotion:

- **Data drift** — is the population of claims currently being trained on still statistically similar to the original seed dataset, feature by feature? Measured with PSI (Population Stability Index).
- **Model drift** — are accuracy/F1/R² holding steady across model versions, or quietly regressing?

Governance observes and records — it never blocks a promotion; that decision stays with `evaluate_and_promote.py`. Every run leaves an audit trail (JSON + HTML report) whether the model was promoted or not.

```bash
cd ml-service
python governance_pipeline.py --challenger demo-challenger --triggered-by manual-demo
start reports\governance\latest.html
```

Reports are written to `ml-service/reports/governance/` (`latest.json` / `latest.html` always point to the most recent run).

## Monitoring

The backend exposes Prometheus metrics at `GET /metrics` (request rate, error rate, p95 latency, in-flight requests, plus ~20 built-in Node process metrics). Prometheus scrapes this every 15s; Grafana's "Claims API Overview" dashboard is auto-provisioned on startup — nothing to configure manually.

Prometheus and Grafana start automatically with `docker compose up --build`. To run just the monitoring stack on its own (skip ml-service/Airflow):

```bash
docker compose up --build backend mongo prometheus grafana
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start-demo.ps1
```

Check that the backend is being scraped successfully:

```bash
curl http://127.0.0.1:9090/api/v1/targets
```

View raw metrics directly from the backend:

```bash
curl http://127.0.0.1:8080/metrics
```

Then open:

```
http://127.0.0.1:9090   → Prometheus (try: rate(claims_api_http_requests_total[1m]))
http://127.0.0.1:3001   → Grafana dashboard (admin/admin)
```

Use `127.0.0.1`, not `localhost` — `localhost` can fail to resolve to these containers in the browser on some machines even when they're up.

## Documentation

- `docs/LLD.docx` — low-level design: entity model, architecture, validation rules
- `docs/API_SECURITY.md` — auth, gateway, and API design
- `docs/FRONTEND.md` — frontend architecture and deployment
- `docs/DATABASE_CHOICE.md` — persistence design and repository pattern
- `docs/MONITORING.md` — Prometheus/Grafana setup and metrics reference
- `docs/MODEL_GOVERNANCE.md` — drift detection design: PSI methodology, thresholds, report format
- `docs/Claim_Prediction_Model_EDA_Accuracy_Report.docx` — ML model EDA and accuracy report
