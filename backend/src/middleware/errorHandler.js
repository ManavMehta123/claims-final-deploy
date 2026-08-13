// Catches anything passed to next(err) plus unexpected exceptions, so the
// API never leaks a raw stack trace and always returns consistent JSON.
function errorHandler(err, _req, res, _next) {
  console.error(err);

  if (err.name === "CastError") {
    return res.status(400).json({ error: "InvalidId", message: "The provided id is not a valid identifier." });
  }
  if (err.name === "ValidationError" && err.errors) {
    return res.status(400).json({
      error: "ValidationError",
      details: Object.values(err.errors).map((e) => e.message),
    });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: "DuplicateKey", message: "A record with that unique field already exists." });
  }

  res.status(err.status || 500).json({
    error: err.name || "InternalServerError",
    message: err.message || "Something went wrong.",
  });
}

module.exports = errorHandler;
