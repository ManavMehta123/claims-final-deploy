# Claims Management System

A full-stack insurance claims platform built with **React (Vite)**, **Node.js/Express**, and **MongoDB**, with a **Flask + scikit-learn** microservice for claim prediction. Secured with JWT auth behind an Nginx gateway, containerized with Docker, and monitored with Prometheus + Grafana.

## Features

- Manage policyholders, policies, and claims with full CRUD and business-rule validation (unique emails, coverage limits, active-policy checks, etc.)
- Configurable persistence — in-memory mode for quick demos, MongoDB-backed mode for production use, behind the same API contract
- JWT-authenticated REST API, documented with Swagger, routed through an Nginx gateway
- React frontend with protected routes and a login flow
- ML-powered claim prediction: a Random Forest model estimates claim likelihood and amount, tracked with MLflow and served via a Flask microservice
- Real-time monitoring with Prometheus metrics and a pre-built Grafana dashboard
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
- Grafana dashboard: `http://localhost:3001` (login `admin`/`admin`)

For non-Docker setup, MongoDB configuration, and API testing via Postman, see `docs/`.

## Documentation

- `docs/LLD.docx` — low-level design: entity model, architecture, validation rules
- `docs/API_SECURITY.md` — auth, gateway, and API design
- `docs/FRONTEND.md` — frontend architecture and deployment
- `docs/DATABASE_CHOICE.md` — persistence design and repository pattern
- `docs/MONITORING.md` — Prometheus/Grafana setup and metrics reference
- `docs/Claim_Prediction_Model_EDA_Accuracy_Report.docx` — ML model EDA and accuracy report
