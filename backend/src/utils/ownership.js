/**
 * Every record (policyholder, policy, claim) is tagged with `createdBy`
 * (the username from the JWT) at creation time. Regular users only ever
 * see/modify records they created; admins see and manage everything.
 *
 * req.user comes from src/middleware/auth.js and has the shape
 * { sub: <username>, role: "user" | "admin", iat, exp }.
 */
function isAdmin(req) {
  return req.user && req.user.role === "admin";
}

// Returns the username to scope a query by, or undefined for an
// unscoped (admin) view.
function ownerScope(req) {
  return isAdmin(req) ? undefined : req.user.sub;
}

// True if `record` (which must have a createdBy field) belongs to the
// requesting user, or the requester is an admin.
function canAccess(req, record) {
  return isAdmin(req) || (record && record.createdBy === req.user.sub);
}

module.exports = { isAdmin, ownerScope, canAccess };
