const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { jwtSecret, jwtExpiresIn, adminUsername, adminPasswordHash } = require("../config/auth");
const { userRepo } = require("../repositories");

function issueToken(username, role) {
  const token = jwt.sign({ sub: username, role }, jwtSecret, { expiresIn: jwtExpiresIn });
  return { token, tokenType: "Bearer", expiresIn: jwtExpiresIn };
}

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 * Creates a new (non-admin) user account. The password is hashed before
 * it's ever stored - the plaintext value never touches the database.
 */
exports.register = async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body;

    if (username.toLowerCase() === adminUsername.toLowerCase()) {
      return res.status(409).json({ error: "Conflict", message: "That username is reserved." });
    }

    const [existingByUsername, existingByEmail] = await Promise.all([
      userRepo.findByUsername(username),
      userRepo.findByEmail(email),
    ]);
    if (existingByUsername) {
      return res.status(409).json({ error: "Conflict", message: "Username is already taken." });
    }
    if (existingByEmail) {
      return res.status(409).json({ error: "Conflict", message: "Email is already registered." });
    }

    // The signup form lets a person pick "user" or "admin" for themselves
    // (Story 5). Joi already restricted `role` to one of those two values
    // and defaults it to "user" when omitted.
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepo.create({ username, email, passwordHash, role: role || "user" });

    const { token, tokenType, expiresIn } = issueToken(user.username, user.role);
    res.status(201).json({
      token,
      tokenType,
      expiresIn,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Verifies credentials against the seeded admin account first, then falls
 * back to registered users. On success, issues a short-lived JWT that must
 * be sent as
 *   Authorization: Bearer <token>
 * on every subsequent request to the protected API routes.
 */
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "BadRequest", message: "username and password are required." });
    }

    // 1) Seeded admin account (credentials come from env, not the DB/memory store).
    if (username === adminUsername) {
      if (!adminPasswordHash) {
        return res.status(500).json({
          error: "ServerMisconfigured",
          message: "ADMIN_PASSWORD_HASH is not set on the server. See backend/.env.example.",
        });
      }
      const adminMatches = await bcrypt.compare(password, adminPasswordHash);
      if (!adminMatches) {
        return res.status(401).json({ error: "InvalidCredentials", message: "Invalid username or password." });
      }
      const { token, tokenType, expiresIn } = issueToken(username, "admin");
      return res.json({ token, tokenType, expiresIn, user: { username, role: "admin" } });
    }

    // 2) Regular, self-registered users.
    const user = await userRepo.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "InvalidCredentials", message: "Invalid username or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "InvalidCredentials", message: "Invalid username or password." });
    }

    const { token, tokenType, expiresIn } = issueToken(user.username, user.role);
    res.json({ token, tokenType, expiresIn, user: { username: user.username, role: user.role } });
  } catch (err) {
    next(err);
  }
};
