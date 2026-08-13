// Wraps a Joi schema into Express middleware. On failure, returns a 400
// with all validation error messages (not just the first) so the client
// can surface everything at once.
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: "ValidationError",
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    next();
  };
}

module.exports = validate;
