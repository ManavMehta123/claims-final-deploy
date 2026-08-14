// Email is sent via the Resend HTTP API (https://resend.com) instead of
// raw SMTP sockets. Render (and many free-tier PaaS hosts) block outbound
// SMTP ports (25/465/587) to prevent spam abuse, which made nodemailer
// time out with ETIMEDOUT on every send even with correct credentials.
// Resend's API is a normal HTTPS POST (port 443), which is never blocked.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Must be an address on a domain you've verified in Resend, OR
// "onboarding@resend.dev" while testing (Resend's shared sandbox sender -
// only delivers to the email address you signed up to Resend with).
const EMAIL_FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

if (!RESEND_API_KEY) {
  // Not fatal - lets the app boot and everything else work even before
  // email is configured. Sending will just log instead (see below).
  console.warn(
    "[mailer] RESEND_API_KEY not set - password reset emails will be " +
      "logged to the console instead of actually sent. See backend/.env.example."
  );
} else {
  console.log("[mailer] Resend configured - ready to send.");
}

/**
 * Sends the "reset your password" email. Resolves even when Resend isn't
 * configured (falls back to a console log of the link) so local/dev use
 * without a real API key doesn't hard-fail the forgot-password request.
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

  if (!RESEND_API_KEY) {
    console.warn(`[mailer] Resend not configured - would have emailed ${to}: ${resetLink}`);
    return { delivered: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[mailer] Resend API error ${res.status}: ${body}`);
  }

  return { delivered: true };
}

module.exports = { sendPasswordResetEmail };
