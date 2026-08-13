import React from "react";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export const UsersIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const ShieldIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const ClipboardIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6M9 16h6" />
  </svg>
);

export const LogoutIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const MenuIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export const InboxIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

export const LockIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const DatabaseIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
  </svg>
);

export const BookOpenIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

export const ArrowRightIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export const TargetIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);

export const SunIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
  </svg>
);

export const MoonIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
  </svg>
);

export const ServerIcon = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="2" y="3" width="20" height="7" rx="1.5" />
    <rect x="2" y="14" width="20" height="7" rx="1.5" />
    <line x1="6" y1="6.5" x2="6.01" y2="6.5" />
    <line x1="6" y1="17.5" x2="6.01" y2="17.5" />
  </svg>
);
