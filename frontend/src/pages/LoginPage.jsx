import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { api } from "../api/api";
import { useAuth } from "../auth/AuthContext";
import ThemeToggle from "../components/ThemeToggle";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || "/policyholders";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs = {};
    if (!username.trim()) errs.username = "Username is required.";
    if (!password) errs.password = "Password is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await api.login(username.trim(), password);
      login(res.token);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err.status === 401) {
        setError("Incorrect username or password.");
      } else if (err.status === 429) {
        setError("Too many login attempts. Please wait a few minutes and try again.");
      } else {
        setError(err.message || "Login failed. Please try again.");
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
       
      </aside>

      <div className="login-main">
        <div className="login-main-toggle"><ThemeToggle /></div>
        <form className="login-card" onSubmit={submit} noValidate>
          <h2>Sign in</h2>
          <p className="muted">Enter your credentials to access the system.</p>

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
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", marginTop: 8, justifyContent: "center" }}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>

          <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
            Don't have an account? <Link to="/register">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
