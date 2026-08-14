import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PolicyholdersPage from "./pages/PolicyholdersPage";
import PoliciesPage from "./pages/PoliciesPage";
import ClaimsPage from "./pages/ClaimsPage";
import PredictClaimPage from "./pages/PredictClaimPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import AdminRoute from "./auth/AdminRoute";
import { useAuth } from "./auth/AuthContext";
import { api, setUnauthorizedHandler } from "./api/api";
import { UsersIcon, ShieldIcon, ClipboardIcon, LogoutIcon, MenuIcon, TargetIcon } from "./components/icons";
import ThemeToggle from "./components/ThemeToggle";

// Home ("/") and Login/Register are full-bleed public pages with their own
// layout - no sidebar, no content padding. Everything else lives inside the
// authenticated app shell below.
const CHROME_FREE_PATHS = ["/", "/login", "/register", "/forgot-password", "/reset-password"];

export default function App() {
  const location = useLocation();

  if (CHROME_FREE_PATHS.includes(location.pathname)) {
    return (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  return <AppShell />;
}

function AppShell() {
  const [health, setHealth] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { isAuthenticated, isAdmin, username, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  // Any API call that gets a 401 (expired/invalid token) lands here, so the
  // session gets cleared and the user is sent back to login from wherever
  // they were, instead of every page having to handle this individually.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      navigate("/login", { replace: true });
    });
  }, [logout, navigate]);

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const doLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      {isAuthenticated && (
        <>
          <div className="mobile-topbar">
            <button className="mobile-menu-btn" onClick={() => setMobileNavOpen((o) => !o)} aria-label="Toggle menu">
              <MenuIcon width={18} height={18} />
            </button>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Claims Management</span>
            <ThemeToggle />
          </div>

          <aside className={`sidebar${mobileNavOpen ? " open" : ""}`}>
            <div className="sidebar-brand">
              <span className="brand-mark" />
              <span style={{ flex: 1 }}>Claims Management</span>
              <ThemeToggle />
            </div>
            <nav className="sidebar-nav">
              <NavLink to="/policyholders"><UsersIcon /> Policyholders</NavLink>
              <NavLink to="/policies"><ShieldIcon /> Policies</NavLink>
              <NavLink to="/claims"><ClipboardIcon /> Claims</NavLink>
              {isAdmin && <NavLink to="/predict-claim"><TargetIcon /> Predict Claim</NavLink>}
            </nav>
            <div className="sidebar-footer">
              {username && (
                <div className="sidebar-user">
                  <span className="sidebar-username">{username}</span>
                  <span className={`role-pill ${isAdmin ? "admin" : "user"}`}>{isAdmin ? "Admin" : "User"}</span>
                </div>
              )}
              {health && (
                <span className={`status-pill ${health.mode?.includes("stateful") ? "stateful" : "stateless"}`}>
                  {health.mode}
                </span>
              )}
              <button className="btn btn-secondary btn-sm" onClick={doLogout} style={{ justifyContent: "center" }}>
                <LogoutIcon width={14} height={14} /> Log out
              </button>
            </div>
          </aside>
        </>
      )}

      <div className="main">
        <main className="content">
          <Routes>
            <Route
              path="/policyholders"
              element={
                <ProtectedRoute>
                  <PolicyholdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/policies"
              element={
                <ProtectedRoute>
                  <PoliciesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/claims"
              element={
                <ProtectedRoute>
                  <ClaimsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/predict-claim"
              element={
                <AdminRoute>
                  <PredictClaimPage />
                </AdminRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
