const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/auth");

/**
 * Protects a route by requiring a valid JWT in the Authorization header:
 *   Authorization: Bearer <token>
 * On success, attaches the decoded payload to req.user and calls next().
 * On failure, responds 401 without ever reaching the controller.
 */
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or malformed Authorization header. Expected: Bearer <token>.",
    });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError" ? "Token has expired. Please log in again." : "Invalid token.";
    return res.status(401).json({ error: "Unauthorized", message });
  }
};
