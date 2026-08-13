// Central place for auth-related config. Keeping this separate from
// controllers/middleware means there's exactly one spot to change if the
// secret, token lifetime, or seeded credentials ever move to a real user
// store / secrets manager.
module.exports = {
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  // Story 4 added real self-registered users (src/repositories/*/userRepo.js);
  // this seeded admin account remains as a separate, always-available login.
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  // Bcrypt hash of the admin password. Generate with:
  //   node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
};
