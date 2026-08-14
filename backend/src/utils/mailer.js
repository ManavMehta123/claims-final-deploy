const nodemailer = require("nodemailer");

// SMTP is configured entirely from env vars so the same code works with
// Gmail (an "App Password", not your normal password), Mailtrap for local
// testing, SendGrid/SES SMTP, etc. See backend/.env.example for the full
// list of variables this reads.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
// Port 465 is implicit TLS; everything else (587, 2525, ...) uses STARTTLS.
const SMTP_SECURE = process.env.SMTP_SECURE
  ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
  : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER || "no-reply@claims-management.local";

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Fail fast instead of hanging - nodemailer's own defaults can wait
    // up to a couple of minutes on a slow/unreachable server, which is
    // pointless for a background send that already has no bearing on
    // the HTTP response.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  // Verify the SMTP credentials/connection once at boot so a bad
  // password or blocked login shows up immediately in the deploy logs,
  // instead of only surfacing later when someone actually requests a
  // password reset.
  transporter
    .verify()
    .then(() => console.log("[mailer] SMTP transporter verified - ready to send."))
    .catch((err) => console.error("[mailer] SMTP verify FAILED - check SMTP_* env vars:", err));
} else {
  // Not fatal - lets the app boot and everything else work even before
  // email is configured. Sending will just log instead (see below).
  console.warn(
    "[mailer] SMTP_HOST/SMTP_USER/SMTP_PASS not fully set - password reset " +
      "emails will be logged to the console instead of actually sent. " +
      "See backend/.env.example."
  );
}

/**
 * Sends the "reset your password" email. Resolves even when SMTP isn't
 * configured (falls back to a console log of the link) so local/dev use
 * without real credentials doesn't hard-fail the forgot-password request.
 */
async function sendPasswordResetEmail({ to, resetLink, expiresInMinutes }) {
  const subject = "Reset your Claims Management System password";
  const text =
    `We received a request to reset your password.\n\n` +
    `Reset your password: ${resetLink}\n\n` +
    `This link expires in ${expiresInMinutes} minutes. ` +
    `If you didn't request this, you can safely ignore this email - ` +
    `your password won't be changed.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#1a2233;">Reset your password</h2>
      <p>We received a request to reset your Claims Management System password.</p>
      <p style="margin: 24px 0;">
        <a href="${resetLink}"
           style="background:#c8952a;color:#1a2233;text-decoration:none;
                  padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block;">
          Reset password
        </a>
      </p>
      <p>Or copy this link into your browser:<br>
        <a href="${resetLink}">${resetLink}</a>
      </p>
      <p style="color:#666;font-size:0.9em;">
        This link expires in ${expiresInMinutes} minutes. If you didn't request this,
        you can safely ignore this email - your password won't be changed.
      </p>
    </div>
  `;

  if (!transporter) {
    console.warn(`[mailer] SMTP not configured - would have emailed ${to}: ${resetLink}`);
    return { delivered: false };
  }

  await transporter.sendMail({ from: EMAIL_FROM, to, subject, text, html });
  return { delivered: true };
}

module.exports = { sendPasswordResetEmail };
