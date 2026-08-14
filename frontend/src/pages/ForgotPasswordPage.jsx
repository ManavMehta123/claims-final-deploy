import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/api";
import ThemeToggle from "../components/ThemeToggle";

export default function ForgotPasswordPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { message, resetLink, resetToken }

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!usernameOrEmail.trim()) {
      setFieldError("Enter your username or email.");
      return;
    }
    setFieldError(null);

    setSubmitting(true);
    try {
      const res = await api.forgotPassword(usernameOrEmail.trim());
      setResult(res);
    } catch (err) {
      if (err.status === 429) {
        setError("Too many reset requests. Please wait a few minutes and try again.");
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <aside className="login-aside">
        <div className="login-aside-top">
          <span className="brand-mark sm" />
          Claims Management System
        </div>
        <div className="login-aside-mid">
          <h1>Forgot your password?</h1>
          <p>
            No problem — your account and all its data stay exactly as they are.
            We'll just help you set a new password.
          </p>
          <Link to="/login" className="login-back-link">← Back to sign in</Link>
        </div>
      </aside>

      <div className="login-main">
        <div className="login-main-toggle"><ThemeToggle /></div>

        {!result ? (
          <form className="login-card" onSubmit={submit} noValidate>
            <h2>Reset your password</h2>
            <p className="muted">Enter your username or email and we'll generate a reset link.</p>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-field">
              <label>Username or email</label>
              <input
                autoFocus
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                aria-invalid={!!fieldError}
              />
              {fieldError && <span className="field-error">{fieldError}</span>}
            </div>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting}
              style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>

            <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
              Remembered it? <Link to="/login">Sign in</Link>
            </p>
          </form>
        ) : (
          <div className="login-card">
            <h2>Check your reset link</h2>
            <p className="muted">{result.message}</p>

            {result.resetLink ? (
              <>
                <div className="alert alert-success" style={{ wordBreak: "break-all", marginTop: 16 }}>
                  <Link to={result.resetLink.replace(window.location.origin, "")}>
                    {result.resetLink}
                  </Link>
                </div>
                <p className="muted" style={{ marginTop: 8, fontSize: "0.85em" }}>
                  This link expires in {result.expiresInMinutes} minutes. No email service is
                  configured yet, so the link is shown here directly instead of being emailed.
                </p>
              </>
            ) : result.resetToken ? (
              <>
                <div className="form-field" style={{ marginTop: 16 }}>
                  <label>Reset token</label>
                  <input value={result.resetToken} readOnly onFocus={(e) => e.target.select()} />
                </div>
                <p className="muted" style={{ fontSize: "0.85em" }}>
                  Copy this token into the reset password page within {result.expiresInMinutes} minutes.
                </p>
                <Link
                  to={`/reset-password?token=${result.resetToken}`}
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
                >
                  Continue to reset password
                </Link>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 16 }}>
                If that account exists, a reset link has been generated for it.
              </p>
            )}

            <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
              <Link to="/login">← Back to sign in</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
