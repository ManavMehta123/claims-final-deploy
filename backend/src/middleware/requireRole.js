/**
 * Restricts a route to one or more roles. Must run after requireAuth
 * (src/middleware/auth.js), which attaches the decoded JWT to req.user.
 *
 * Usage: router.post("/", requireRole("admin"), controller.create);
 */
module.exports = function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized", message: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `This action requires one of the following roles: ${allowedRoles.join(", ")}.`,
      });
    }
    next();
  };
};
