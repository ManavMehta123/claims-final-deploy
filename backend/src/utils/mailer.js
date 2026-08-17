// Email is sent via the Brevo HTTP API (https://brevo.com) instead of
// raw SMTP sockets. Render (and many free-tier PaaS hosts) block outbound
// SMTP ports (25/465/587) to prevent spam abuse, which made nodemailer
// time out with ETIMEDOUT on every send even with correct credentials.
// Brevo's API is a normal HTTPS POST (port 443), which is never blocked.
//
// Unlike Resend's free-tier sandbox sender (which only delivers to the
// developer's own signup email), a Brevo sender only needs to be
// individually verified (click a confirmation link Brevo emails you) -
// no domain purchase/DNS setup required - and can then send to ANY
// recipient. See Settings > Senders, domains, IPs in the Brevo dashboard.
const BREVO_API_KEY = process.env.BREVO_API_KEY;
// Must be an email address verified as a sender in your Brevo account
// (Settings > Senders, domains, IPs). E.g. your own Gmail address.
const EMAIL_FROM = process.env.EMAIL_FROM || "manavmehta197@gmail.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Claims Management System";

if (!BREVO_API_KEY) {
  // Not fatal - lets the app boot and everything else work even before
  // email is configured. Sending will just log instead (see below).
  console.warn(
    "[mailer] BREVO_API_KEY not set - password reset emails will be " +
      "logged to the console instead of actually sent. See backend/.env.example."
  );
} else {
  console.log("[mailer] Brevo configured - ready to send.");
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

  if (!BREVO_API_KEY) {
    console.warn(`[mailer] Brevo not configured - would have emailed ${to}: ${resetLink}`);
    return { delivered: false };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[mailer] Brevo API error ${res.status}: ${body}`);
  }

  return { delivered: true };
}

module.exports = { sendPasswordResetEmail };
