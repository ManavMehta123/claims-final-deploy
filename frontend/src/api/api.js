import { getStoredToken, clearStoredToken } from "../auth/AuthContext";

// In dev, Vite's proxy (vite.config.js) forwards /api and /health to the
// local backend, so a relative path works with no configuration.
// In production (e.g. deployed on AWS Amplify), the frontend is a static
// bundle hosted separately from the backend, so VITE_API_BASE_URL must be
// set at build time to the deployed backend/gateway's full URL.
// The env var may be either the backend root (https://api.example.com)
// or the gateway prefix (https://api.example.com/api).
const rawApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const apiHost = rawApiBase ? rawApiBase.replace(/\/+$/, "").replace(/\/api$/, "") : "";
const BASE = rawApiBase ? `${apiHost}/api` : "/api";
const HEALTH_URL = rawApiBase ? `${apiHost}/health` : "/health";

// Set by App.jsx once, so a 401 anywhere can kick the user back to /login
// without every single page having to handle that case itself.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const token = getStoredToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;

  if (res.status === 401) {
    // Token missing/expired/invalid - the backend already rejected the
    // request, so clear the stale session and send the user to log in
    // again rather than showing a confusing generic error.
    clearStoredToken();
    onUnauthorized();
  }

  if (!res.ok) {
    const err = new Error(body?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = body?.details;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  // Auth
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username, email, password, role = "user") =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ username, email, password, role }) }),
  // usernameOrEmail is sent as whichever field it looks like, so the same
  // form field works whether the person types their username or email.
  forgotPassword: (usernameOrEmail) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(
        usernameOrEmail.includes("@") ? { email: usernameOrEmail } : { username: usernameOrEmail }
      ),
    }),
  resetPassword: (token, newPassword) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),

  // Policyholders
  listPolicyholders: () => request("/policyholders"),
  getPolicyholder: (id) => request(`/policyholders/${id}`),
  createPolicyholder: (data) => request("/policyholders", { method: "POST", body: JSON.stringify(data) }),
  updatePolicyholder: (id, data) => request(`/policyholders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePolicyholder: (id) => request(`/policyholders/${id}`, { method: "DELETE" }),

  // Policies
  listPolicies: (policyholderId) =>
    request(`/policies${policyholderId ? `?policyholderId=${policyholderId}` : ""}`),
  getPolicy: (id) => request(`/policies/${id}`),
  createPolicy: (data) => request("/policies", { method: "POST", body: JSON.stringify(data) }),
  updatePolicy: (id, data) => request(`/policies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePolicy: (id) => request(`/policies/${id}`, { method: "DELETE" }),

  // Claims
  listClaims: (policyId) => request(`/claims${policyId ? `?policyId=${policyId}` : ""}`),
  getClaim: (id) => request(`/claims/${id}`),
  createClaim: (data) => request("/claims", { method: "POST", body: JSON.stringify(data) }),
  updateClaim: (id, data) => request(`/claims/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteClaim: (id) => request(`/claims/${id}`, { method: "DELETE" }),

  // Claim amount prediction (ML service, proxied through the backend)
  predictClaim: (data) => request("/predict-claim", { method: "POST", body: JSON.stringify(data) }),
  predictClaimLLM: (data) => request("/predict-claim/llm", { method: "POST", body: JSON.stringify(data) }),

  // Health is public, no token needed
  health: async () => {
    const res = await fetch(HEALTH_URL);
    return res.json();
  },
};
