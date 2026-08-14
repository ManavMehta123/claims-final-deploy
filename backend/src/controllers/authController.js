const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { jwtSecret, jwtExpiresIn, adminUsername, adminPasswordHash } = require("../config/auth");
const { userRepo } = require("../repositories");

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashResetToken(rawToken) {
  // The raw token only ever exists in the one-time link. We store a
  // SHA-256 hash of it (like a password hash, but this token is
  // short-lived and single-use) so a database leak alone can't be used
  // to reset anyone's password.
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

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

/**
 * POST /api/auth/forgot-password
 * Body: { username } or { email }
 * Issues a short-lived, single-use reset token on the user's EXISTING
 * record — it never creates a new account, so all of that user's
 * policyholders/policies/claims stay exactly where they are.
 *
 * No email service is configured, so — deliberately, for now — the raw
 * reset link is returned directly in the response instead of emailed.
 * Always responds 200 with a generic message even when no account
 * matches, so this endpoint can't be used to check which
 * usernames/emails are registered.
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { username, email } = req.body || {};
    const genericResponse = {
      message: "If an account exists, a password reset link has been generated.",
    };

    // The seeded admin account has no DB record and no forgot-password
    // support (its credentials live in env vars, not the user store).
    if (username && username === adminUsername) {
      return res.json(genericResponse);
    }

    const user = username ? await userRepo.findByUsername(username) : await userRepo.findByEmail(email);
    if (!user) {
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashResetToken(rawToken);
    const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await userRepo.setResetToken(user.id, resetTokenHash, resetTokenExpiresAt);

    const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    const resetLink = frontendUrl
      ? `${frontendUrl}/reset-password?token=${rawToken}`
      : null;

    res.json({
      ...genericResponse,
      // Shown directly in the UI in place of an email, until an email
      // service is wired up. Remove resetToken/resetLink from the
      // response once real email delivery is added.
      resetToken: rawToken,
      resetLink,
      expiresInMinutes: RESET_TOKEN_TTL_MS / 60000,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 * Verifies the (hashed, non-expired) token, then updates passwordHash on
 * the SAME user record and clears the token. The account's id, role, and
 * all linked data are untouched — only the password changes.
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};
    const resetTokenHash = hashResetToken(token);
    const user = await userRepo.findByValidResetTokenHash(resetTokenHash);

    if (!user) {
      return res.status(400).json({
        error: "InvalidOrExpiredToken",
        message: "This reset link is invalid or has expired. Please request a new one.",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await userRepo.updatePasswordAndClearToken(user.id, passwordHash);

    res.json({ message: "Password updated successfully. You can now sign in with your new password." });
  } catch (err) {
    next(err);
  }
};
