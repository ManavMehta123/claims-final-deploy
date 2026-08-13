const client = require("prom-client");

// One registry for the whole process. Collects Node/OS-level metrics
// (event loop lag, heap usage, GC pauses, CPU, open handles, etc.) for
// free, in the same format Prometheus already understands.
const register = new client.Registry();
client.collectDefaultMetrics({
  register,
  prefix: "claims_api_",
});

// --- Custom application metrics --------------------------------------
// These answer the questions an on-call engineer actually asks:
// "is the API slow?", "is it erroring?", "which routes are hot?".

const httpRequestDuration = new client.Histogram({
  name: "claims_api_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds, labeled by method/route/status.",
  labelNames: ["method", "route", "status_code"],
  // Buckets tuned for a typical CRUD API: most requests should land well
  // under 250ms, with a long tail out to 5s before we call it "slow".
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: "claims_api_http_requests_total",
  help: "Total number of HTTP requests received, labeled by method/route/status.",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: "claims_api_http_errors_total",
  help: "Total number of HTTP responses with status code >= 400.",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const inFlightRequests = new client.Gauge({
  name: "claims_api_in_flight_requests",
  help: "Number of HTTP requests currently being processed.",
  registers: [register],
});

module.exports = {
  register,
  httpRequestDuration,
  httpRequestsTotal,
  httpErrorsTotal,
  inFlightRequests,
};
