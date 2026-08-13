import React from "react";
import { useTheme } from "../theme/ThemeContext";
import { SunIcon, MoonIcon } from "./icons";

// A small segmented light/dark switch. Purely cosmetic - flips the
// `data-theme` attribute on <html>, which every color in index.css
// derives from. No app data or routes are touched.
export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      <span className="theme-toggle-track">
        <span className={`theme-toggle-thumb${isDark ? " is-dark" : ""}`}>
          {isDark ? <MoonIcon width={12} height={12} /> : <SunIcon width={12} height={12} />}
        </span>
      </span>
    </button>
  );
}
