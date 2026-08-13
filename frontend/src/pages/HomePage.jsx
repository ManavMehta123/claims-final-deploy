import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  UsersIcon,
  ShieldIcon,
  ClipboardIcon,
  LockIcon,
  DatabaseIcon,
  BookOpenIcon,
  ServerIcon,
  ArrowRightIcon,
} from "../components/icons";
import ThemeToggle from "../components/ThemeToggle";

const MODULES = [
  {
    icon: UsersIcon,
    title: "Policyholders",
    text: "Onboard and manage the people and entities covered under your policies, with full CRUD and validation.",
  },
  {
    icon: ShieldIcon,
    title: "Policies",
    text: "Issue coverage, track terms and premiums, and keep every policy's status current across its lifecycle.",
  },
  {
    icon: ClipboardIcon,
    title: "Claims",
    text: "File and process claims against active coverage, with remaining-coverage checks built into the workflow.",
  },
];

const ARCHITECTURE = [
  {
    icon: LockIcon,
    title: "JWT-secured API",
    text: "Protected routes require a valid login token to access.",
  },
  {
    icon: ShieldIcon,
    title: "Role-based access",
    text: "Admin and user roles see different features — some pages are admin-only.",
  },
  {
    icon: DatabaseIcon,
    title: "MongoDB persistence",
    text: "Policyholder, policy, and claims data is stored in MongoDB.",
  },
  {
    icon: ServerIcon,
    title: "Environment-based config",
    text: "Settings like the database and secrets are read from environment variables, not hardcoded.",
  },
];

const STACK = ["Node.js", "Express", "MongoDB", "React", "Vite","Docker",];

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const primaryTo = isAuthenticated ? "/policyholders" : "/login";
  const primaryLabel = isAuthenticated ? "Go to dashboard" : "Sign in";

  return (
    <div className="home-shell">
      <header className="home-nav">
        <div className="brand">
          <span className="brand-mark" />
          Claims Management System
        </div>
        <nav className="home-nav-links">
          <a href="#modules">Modules</a>
          <a href="#architecture">Architecture</a>
          <a href="#stack">Tech stack</a>
        </nav>
        <div className="home-nav-actions">
          <ThemeToggle />
          <Link className="btn btn-primary btn-sm" to={primaryTo}>{primaryLabel}</Link>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-hero-copy">
       
          <h1>Policies, policyholders, and claims — in one system.</h1>
          <p>
           Secure Claims Management Platform — Built a full-stack claims management system that allows users to manage the complete claims process through a React frontend. Developed a secure REST API with JWT authentication, used MongoDB for data storage, and configured Nginx as a gateway for handling API requests and security.

          </p>
          <div className="home-hero-actions">
            <Link className="btn btn-primary" to={primaryTo}>
              {primaryLabel} <ArrowRightIcon width={15} height={15} />
            </Link>
            <a className="btn btn-secondary" href="#architecture">See how it's built</a>
          </div>
        </div>

        <div className="home-hero-preview" aria-hidden="true">
          <div className="preview-window">
            <div className="preview-titlebar">
              <span className="preview-dot" /><span className="preview-dot" /><span className="preview-dot" />
              <span className="preview-url">app.claims-management.io/policyholders</span>
            </div>
            <div className="preview-body">
              <div className="preview-row preview-row-head">
                <span>Name</span><span>Phone</span><span>Status</span>
              </div>
              {[
                ["AS", "Aditi Sharma", "+91 98765 22110", "Active"],
                ["RK", "Rahul Kapoor", "+91 91234 55678", "Active"],
                ["MP", "Meera Pillai", "+91 90000 12345", "Pending"],
              ].map(([ini, name, phone, status]) => (
                <div className="preview-row" key={name}>
                  <span className="preview-name"><span className="avatar">{ini}</span>{name}</span>
                  <span className="cell-mono">{phone}</span>
                  <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="home-section" id="modules">
        <div className="home-section-head">
          <h2>Three modules, one workflow</h2>
          <p>Everything a claims desk needs, connected end to end.</p>
        </div>
        <div className="home-grid home-grid-3">
          {MODULES.map(({ icon: Icon, title, text }) => (
            <div className="home-card" key={title}>
              <div className="home-card-icon"><Icon width={18} height={18} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section home-section-dark" id="architecture">
        <div className="home-section-head">
          <h2>Built like a production system</h2>
          <p>The backend practices behind the API — security, routing, storage, and docs.</p>
        </div>
        <div className="home-grid home-grid-4">
          {ARCHITECTURE.map(({ icon: Icon, title, text }) => (
            <div className="home-card home-card-dark" key={title}>
              <div className="home-card-icon home-card-icon-dark"><Icon width={17} height={17} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section" id="stack">
        <div className="home-section-head">
          <h2>Built with</h2>
        </div>
        <div className="home-stack">
          {STACK.map((s) => <span className="stack-pill" key={s}>{s}</span>)}
        </div>
      </section>

      <section className="home-cta">
        <h2>Ready to see it in action?</h2>
        <p>Sign in to manage policyholders, issue policies, and process claims.</p>
        <Link className="btn btn-primary" to={primaryTo}>{primaryLabel}</Link>
      </section>

      <footer className="home-footer">
        <span>Claims Management System</span>
       
      </footer>
    </div>
  );
}
