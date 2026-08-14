import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/api";
import ThemeToggle from "../components/ThemeToggle";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The token comes only from the emailed link's URL - it's never shown
  // or typed by the person, so there's nothing to copy/paste.
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const validate = () => {
    const errs = {};
    if (!newPassword) errs.newPassword = "New password is required.";
    else if (newPassword.length < 8) errs.newPassword = "Password must be at least 8 characters.";
    if (confirmPassword !== newPassword) errs.confirmPassword = "Passwords do not match.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      if (err.status === 400) {
        setError(err.message || "This reset link is invalid or has expired. Please request a new one.");
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
          <h1>Set a new password.</h1>
          <p>
            Your account, policyholders, policies, and claims stay exactly as
            they were — only your password changes.
          </p>
          <Link to="/login" className="login-back-link">← Back to sign in</Link>
        </div>
      </aside>

      <div className="login-main">
        <div className="login-main-toggle"><ThemeToggle /></div>

        {!token ? (
          <div className="login-card">
            <h2>Reset link missing</h2>
            <div className="alert alert-error" style={{ marginTop: 8 }}>
              This page needs the reset link from your email. Please open the
              link in the password reset email, or request a new one.
            </div>
            <Link
              to="/forgot-password"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
            >
              Request a reset link
            </Link>
          </div>
        ) : !done ? (
          <form className="login-card" onSubmit={submit} noValidate>
            <h2>Reset password</h2>
            <p className="muted">Choose a new password for your account.</p>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-field">
              <label>New password</label>
              <input
                autoFocus
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-invalid={!!fieldErrors.newPassword}
              />
              {fieldErrors.newPassword && <span className="field-error">{fieldErrors.newPassword}</span>}
            </div>

            <div className="form-field">
              <label>Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={!!fieldErrors.confirmPassword}
              />
              {fieldErrors.confirmPassword && <span className="field-error">{fieldErrors.confirmPassword}</span>}
            </div>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting}
              style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
            >
              {submitting ? "Updating..." : "Update password"}
            </button>

            <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
              Link expired or not working? <Link to="/forgot-password">Request a new one</Link>
            </p>
          </form>
        ) : (
          <div className="login-card">
            <h2>Password updated</h2>
            <div className="alert alert-success" style={{ marginTop: 8 }}>
              Your password has been changed. Your account and all its data are unchanged —
              you can sign in right away with your new password.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/login", { replace: true })}
              style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
            >
              Go to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
