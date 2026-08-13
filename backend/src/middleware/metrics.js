const {
  httpRequestDuration,
  httpRequestsTotal,
  httpErrorsTotal,
  inFlightRequests,
} = require("../config/metrics");

// Resolves the *route pattern* rather than the raw URL, so
// /api/claims/64f1... and /api/claims/64f2... both roll up into
// "/api/claims/:id" instead of exploding into one label per record id.
function resolveRoute(req) {
  if (req.route && req.baseUrl) {
    return `${req.baseUrl}${req.route.path}`;
  }
  if (req.route) {
    return req.route.path;
  }
  return req.path;
}

// Wraps every request in start/end timers so each one contributes a
// single observation to the histogram/counters above, regardless of
// whether it succeeds, errors, or is handled by the 404 fallback.
function metricsMiddleware(req, res, next) {
  const endTimer = httpRequestDuration.startTimer();
  inFlightRequests.inc();

  res.on("finish", () => {
    const route = resolveRoute(req);
    const labels = { method: req.method, route, status_code: res.statusCode };

    inFlightRequests.dec();
    endTimer(labels);
    httpRequestsTotal.inc(labels);
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });

  next();
}

module.exports = metricsMiddleware;
