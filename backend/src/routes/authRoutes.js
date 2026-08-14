const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const controller = require("../controllers/authController");
const validate = require("../validators/validate");
const { registerSchema, forgotPasswordSchema, resetPasswordSchema } = require("../validators/schemas");

// Defense-in-depth against credential brute-forcing, independent of any
// rate limiting the Nginx gateway also applies in front of the API.
//
// Keyed by IP + the username being attempted (not IP alone). Several
// people can be behind the same IP (shared office network, corporate
// NAT, a Docker/Nginx gateway) — keying on IP alone means one person
// mistyping their password repeatedly locks *everyone* on that IP out
// of logging in, including into completely different accounts.
// ipKeyGenerator() normalizes IPv6 addresses safely instead of using
// the raw string, per express-rate-limit's own guidance.
function loginKey(req) {
  const username = (req.body?.username || "").trim().toLowerCase();
  return `${ipKeyGenerator(req.ip)}:${username || "unknown"}`;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginKey,
  message: { error: "TooManyRequests", message: "Too many login attempts. Try again later." },
});

// Separate, slightly looser limiter for registration so it isn't affected
// by (or doesn't affect) login brute-force protection. Registration has
// no meaningful "username being attempted" the same way login does (the
// account doesn't exist yet), so this one stays keyed by IP alone.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many registration attempts. Try again later." },
});

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Create a new user account and obtain a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: jane_doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: aStrongPassword123
 *     responses:
 *       201:
 *         description: Account created, JWT issued
 *       400:
 *         description: Validation error
 *       409:
 *         description: Username or email already taken
 *       429:
 *         description: Too many registration attempts
 */
router.post("/register", registerLimiter, validate(registerSchema), controller.register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in and obtain a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 format: password
 *                 example: yourpassword
 *     responses:
 *       200:
 *         description: Login succeeded, JWT issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 tokenType:
 *                   type: string
 *                   example: Bearer
 *                 expiresIn:
 *                   type: string
 *                   example: 1h
 *       400:
 *         description: username or password missing
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
router.post("/login", loginLimiter, controller.login);

// Same brute-force protection rationale as loginLimiter — keyed by IP
// alone here since there's no "account being attempted" concept before
// a token exists.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many reset requests. Try again later." },
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link for an existing account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: >
 *           Always returns 200 with a generic message, whether or not the
 *           account exists (prevents username/email enumeration). If it
 *           does exist, also includes resetToken/resetLink directly in
 *           the response, since no email service is configured yet.
 */
router.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordSchema), controller.forgotPassword);

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Set a new password using a valid reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Token missing, invalid, or expired
 */
router.post("/reset-password", validate(resetPasswordSchema), controller.resetPassword);

module.exports = router;
