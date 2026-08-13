import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/api";
import { useAuth } from "../auth/AuthContext";
import ThemeToggle from "../components/ThemeToggle";

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("user");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs = {};
    if (!username.trim()) errs.username = "Username is required.";
    else if (username.trim().length < 3) errs.username = "Username must be at least 3 characters.";

    if (!email.trim()) errs.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";

    if (!password) errs.password = "Password is required.";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters.";

    if (confirmPassword !== password) errs.confirmPassword = "Passwords do not match.";

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await api.register(username.trim(), email.trim(), password, role);
      login(res.token);
      navigate("/policyholders", { replace: true });
    } catch (err) {
      if (err.status === 409) {
        setError(err.message || "That username or email is already in use.");
      } else if (err.status === 400 && err.details?.length) {
        setError(err.details.join(" "));
      } else if (err.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setError(err.message || "Registration failed. Please try again.");
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
          <h1>Policies, policyholders, and claims — in one place.</h1>
          <p>
            System for managing the full claims lifecycle: onboarding
            policyholders, issuing policies, and processing claims against coverage.
          </p>
          <Link to="/" className="login-back-link">← Back to home</Link>
        </div>
        <div className="login-aside-foot"></div>
      </aside>

      <div className="login-main">
        <div className="login-main-toggle"><ThemeToggle /></div>
        <form className="login-card" onSubmit={submit} noValidate>
          <h2>Create an account</h2>
          <p className="muted">Sign up to access the system.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-field">
            <label>Username</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={!!fieldErrors.username}
            />
            {fieldErrors.username && <span className="field-error">{fieldErrors.username}</span>}
          </div>

          <div className="form-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </div>

          <div className="form-field">
            <label>Account type</label>
            <div className="role-toggle" role="radiogroup" aria-label="Account type">
              <button
                type="button"
                role="radio"
                aria-checked={role === "user"}
                className={`role-toggle-btn${role === "user" ? " active" : ""}`}
                onClick={() => setRole("user")}
              >
                User
                <span className="role-toggle-hint">View records, file claims</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={role === "admin"}
                className={`role-toggle-btn${role === "admin" ? " active" : ""}`}
                onClick={() => setRole("admin")}
              >
                Admin
                <span className="role-toggle-hint">Manage policyholders, policies &amp; claims</span>
              </button>
            </div>
          </div>

          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </div>

          <div className="form-field">
            <label>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={!!fieldErrors.confirmPassword}
            />
            {fieldErrors.confirmPassword && <span className="field-error">{fieldErrors.confirmPassword}</span>}
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", marginTop: 8, justifyContent: "center" }}>
            {submitting ? "Creating account..." : "Create account"}
          </button>

          <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
