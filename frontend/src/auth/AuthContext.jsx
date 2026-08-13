import React, { createContext, useContext, useState, useCallback } from "react";

// sessionStorage (not localStorage) so the token clears when the browser
// tab closes - a reasonable default for a demo admin token. The Story 3
// backend expires the JWT after 1h regardless.
const STORAGE_KEY = "cms_token";

// The JWT payload (base64url-encoded JSON in the middle segment) already
// carries { sub: username, role }. We only need it client-side to decide
// what UI to show - the backend independently re-verifies the signature
// on every request, so there's no security implication to reading it here
// without verifying it.
function decodeRole(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { sub, role } = JSON.parse(json);
    return { username: sub, role: role || "user" };
  } catch {
    return { username: null, role: null };
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_KEY));
  const { username, role } = token ? decodeRole(token) : { username: null, role: null };

  const login = useCallback((newToken) => {
    sessionStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        username,
        role,
        isAdmin: role === "admin",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}

// Non-hook accessor so the plain api.js request() function (outside React)
// can read the current token without needing to be a component.
export function getStoredToken() {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearStoredToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}
