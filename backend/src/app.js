const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const { useDb } = require("./repositories");
const errorHandler = require("./middleware/errorHandler");
const swaggerSpec = require("./config/swagger");
const metricsMiddleware = require("./middleware/metrics");
const { register } = require("./config/metrics");

const app = express();

// Required for req.ip (and req.secure) to reflect the real client address
// instead of the Nginx gateway's own address — see nginx/nginx.conf, which
// already forwards X-Forwarded-For. Without this, every request arriving
// through the gateway looks like it comes from the same IP, which breaks
// IP-based rate limiting (src/routes/authRoutes.js) for everyone behind
// it. `1` trusts exactly one hop (the Nginx container), which matches
// this deployment's topology.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Times and counts every request that reaches the API, before routing,
// so it also covers 404s and requests that error out downstream.
app.use(metricsMiddleware);

// Public: health check and Swagger docs need no token so evaluators/tools
// can always reach them.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", mode: useDb ? "stateful (MongoDB)" : "stateless (in-memory)" });
});

// Public, Prometheus-format scrape endpoint (no auth — same reasoning as
// /health: monitoring infrastructure needs unconditional access). Not
// exposed through the Nginx gateway; Prometheus scrapes it directly over
// the internal Docker network (see docker-compose.yml + monitoring/).
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: "Claims Management API Docs" }));
app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));

// Public: issues the JWT that every route below requires.
app.use("/api/auth", require("./routes/authRoutes"));

// Protected: each router applies requireAuth internally (see routes/*.js).
app.use("/api/policyholders", require("./routes/policyholderRoutes"));
app.use("/api/policies", require("./routes/policyRoutes"));
app.use("/api/claims", require("./routes/claimRoutes"));
app.use("/api/predict-claim", require("./routes/predictionRoutes"));

// Feeds the Continuous Learning Pipeline's data ingestion DAG — see
// ml-service/ingestion/ingest.py and docs/CONTINUOUS_LEARNING.md.
app.use("/api/ml", require("./routes/mlExportRoutes"));

app.use((_req, res) => res.status(404).json({ error: "NotFound", message: "Route not found." }));
app.use(errorHandler);

module.exports = app;
