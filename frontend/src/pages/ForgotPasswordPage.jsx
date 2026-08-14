import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/api";
import ThemeToggle from "../components/ThemeToggle";

export default function ForgotPasswordPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!usernameOrEmail.trim()) {
      setFieldError("Enter your username or email.");
      return;
    }
    setFieldError(null);

    setSubmitting(true);
    try {
      await api.forgotPassword(usernameOrEmail.trim());
      setSent(true);
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
            We'll email you a link to set a new password.
          </p>
          <Link to="/login" className="login-back-link">← Back to sign in</Link>
        </div>
      </aside>

      <div className="login-main">
        <div className="login-main-toggle"><ThemeToggle /></div>

        {!sent ? (
          <form className="login-card" onSubmit={submit} noValidate>
            <h2>Reset your password</h2>
            <p className="muted">Enter your username or email and we'll send you a reset link.</p>

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
            <h2>Check your email</h2>
            <div className="alert alert-success" style={{ marginTop: 8 }}>
              If an account exists for that username or email, we've sent a password
              reset link to its inbox.
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              The link expires in 30 minutes. Open it from your email to set a new
              password — no need to come back to this page.
            </p>

            <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
              <Link to="/login">← Back to sign in</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
