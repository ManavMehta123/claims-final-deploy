# Story 4 — Create a User Interface / Frontend

## 1. Framework — React (via Vite)

The existing Policyholders/Policies/Claims pages (built earlier) already used React + Vite +
`react-router-dom`. Story 4 adds a login screen and route protection on top of that, rather
than rebuilding it in a different framework — React was chosen originally for its ecosystem
and because it pairs naturally with the JWT-based API from Story 3 (fetch + Bearer header,
no server-rendered sessions).

## 2. Auth flow

- `src/auth/AuthContext.jsx` — a small React Context holding the current JWT. The token lives
  in `sessionStorage` (not `localStorage`), so it clears when the browser tab closes rather
  than persisting indefinitely — a reasonable default for an admin tool, and it still survives
  page refreshes within the same session.
- `src/pages/LoginPage.jsx` — client-side validation (required fields) before it ever calls the
  API, then calls `POST /api/auth/login`. Handles three outcomes distinctly: wrong credentials
  (401), rate-limited (429, from Story 3's login limiter), and anything else (generic network/
  server error) — each with its own message instead of one generic "something went wrong."
- `src/auth/ProtectedRoute.jsx` — wraps the Policyholders/Policies/Claims routes; redirects to
  `/login` if there's no token, and remembers where the user was trying to go so they land back
  there after logging in.
- `src/api/api.js` — every request automatically attaches `Authorization: Bearer <token>` if one
  exists. If any response comes back `401` (token missing/expired/invalid), the app clears the
  stale session and redirects to `/login` from wherever the user was — one central handler
  (`setUnauthorizedHandler` in `App.jsx`) instead of every page catching 401s individually.

## 3. Forms — data entry, validation, error handling

The CRUD forms (create/edit Policyholder, Policy, Claim) already existed with:
- Required-field and type validation via native HTML5 attributes (`required`, `type="email"`,
  `type="date"`, `type="number"`), giving instant browser-level feedback before a request is
  even sent.
- Server-side validation errors (from the backend's Joi schemas) surfaced back into the form
  as a visible alert, not just a console error or silent failure.
- Login adds a second layer on top: explicit required-field checks with per-field messages
  (`fieldErrors`), separate from the server-side error alert shown after a failed API call.

## 4. Deployment — CI/CD from Git

**Choice: AWS Amplify**, using `amplify.yml` at the project root as the build spec.
- Connect the GitHub repo in the Amplify Console → it detects `amplify.yml` automatically.
- Every push to the connected branch triggers a rebuild + redeploy — no manual deploy step.
- `amplify.yml` builds only `frontend/` (`cd frontend && npm ci && npm run build`) and
  publishes `frontend/dist` — the backend is a separate deployment target entirely (this is a
  static frontend host, not a Node host).
- Because frontend and backend are deployed separately, the frontend needs to know the
  backend's real URL at build time: set `VITE_API_BASE_URL` as an environment variable in the
  Amplify Console (App settings → Environment variables). Locally, this is left unset and Vite's
  dev proxy (`vite.config.js`) handles it instead — see `frontend/.env.example`.

## Viva-ready Q&A

**Q: Why sessionStorage instead of localStorage for the token?**
localStorage persists indefinitely across tabs/browser restarts, which is a larger XSS/theft
window for an admin token. sessionStorage clears when the tab closes — safer default for a
demo/admin tool where every session is short-lived and re-login is cheap.

**Q: What happens if the JWT expires while someone is using the app?**
Their next API call gets a `401` from the backend, `api.js` catches it, clears the stored
token, and `App.jsx`'s handler redirects them to `/login` — no crash, no stuck loading state.

**Q: Why is the API base URL an env var instead of hardcoded?**
Because the frontend (Amplify) and backend (wherever it's hosted) are deployed independently,
with different domains. Hardcoding `localhost:5000` would only work in local dev; the env var
lets the same built code point at different backends per environment (dev/staging/prod)
without code changes.

**Q: Why AWS Amplify over Vercel/Netlify?**
Any of them would satisfy "any cloud service with CI from Git" — Amplify was picked because
it's AWS-native (consistent with using AWS-style tooling elsewhere) and its build spec format
(`amplify.yml`) is simple to check into the repo alongside the code it builds.
