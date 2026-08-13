# Story 3 — Securing and Documenting the APIs

This story sits on top of Story 2 (MongoDB-backed CMS). Nothing about the data layer or
business rules changed; three things were added **in front of** and **around** the existing
API.

## 1. API Gateway — Nginx

**Choice: Nginx, run locally/self-hosted via Docker** (the "any cloud of your choice" option
interpreted as "any gateway, deployed anywhere" — Nginx was picked over a managed cloud
gateway like AWS API Gateway because it's free, runs identically on a laptop or any VM/cloud
instance, and is easy to demo end-to-end without a cloud account).

What it does (`nginx/nginx.conf`):
- Single public entry point on port `8080`. The Node/Express process (`backend`) is **not**
  published to the host directly in `docker-compose.yml` — only Nginx is. This mirrors how a
  real API gateway sits in front of a private backend.
- **Rate limiting**: `limit_req_zone` throttles each client IP to 10 req/s with a burst of 20,
  returning `503` once exceeded. This is independent from the app-level login limiter (below).
- **Security headers**: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` added
  to every response.
- **Reverse proxy**: `/api/*`, `/health`, and `/api-docs*` are proxied to the backend, with
  `X-Real-IP` / `X-Forwarded-*` headers set so the app can see the real client IP if needed.

## 2. Security — JWT

**Choice: JWT (JSON Web Token)**, over API keys or full OAuth, because it's stateless (no
session store needed, fits the same "no server-side session" philosophy as Story 1), and it's
the standard fit for a SPA-style frontend (Story 4) calling a JSON API.

Flow:
1. `POST /api/auth/login` with `{ username, password }` → validated against a seeded admin
   account (`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` in `.env` — the hash is bcrypt, the raw
   password is never stored). Full user management (signup, roles, multiple accounts) is out
   of scope for this story; the seeded account is enough to demonstrate real token issuance
   and verification.
2. On success, the server signs a JWT (`jsonwebtoken`, `HS256`) containing `{ sub, role }`,
   expiring after `JWT_EXPIRES_IN` (default `1h`), signed with `JWT_SECRET`.
3. Every subsequent request to `/api/policyholders`, `/api/policies`, `/api/claims` must
   include `Authorization: Bearer <token>`. `src/middleware/auth.js` verifies the signature
   and expiry before the request reaches any controller — invalid/missing/expired tokens get
   a `401` and never touch business logic.
4. `/health`, `/api-docs`, and `/api/auth/login` remain public (login obviously needs to be
   reachable without a token; health/docs are read-only and non-sensitive).
5. The login endpoint itself is rate-limited (`express-rate-limit`, 10 attempts / 15 min per
   IP) to blunt credential brute-forcing — a second, app-level layer of defense on top of the
   gateway's IP-based rate limit.

## 3. Documentation — Swagger / OpenAPI

**Choice: `swagger-jsdoc` + `swagger-ui-express`.** Every route file carries `@openapi` JSDoc
comments right next to the route it describes, so the spec can't drift out of sync the way a
hand-maintained separate YAML file would. `swagger-jsdoc` compiles those comments into an
OpenAPI 3.0 spec at boot; `swagger-ui-express` serves an interactive "try it out" UI.

- Interactive docs: `GET /api-docs` (via gateway: `http://localhost:8080/api-docs`)
- Raw spec: `GET /api-docs.json`
- A `bearerAuth` security scheme is registered globally, so Swagger UI has an **Authorize**
  button — paste in a JWT from `/api/auth/login` once, and every "Try it out" call in the UI
  sends it automatically.

## Run it (Docker, gateway + backend + Mongo)

```bash
cd backend
cp .env.example .env
# Generate a bcrypt hash for your chosen admin password and put it in .env:
node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"
# Paste that hash into ADMIN_PASSWORD_HASH in backend/.env, and set a real JWT_SECRET.
cd ..
docker compose up --build
```

- API (through the gateway): `http://localhost:8080`
- Swagger UI: `http://localhost:8080/api-docs`
- Mongo runs in its own container; the backend is reachable **only** through the gateway.

## Run it (no Docker, for local dev)

```bash
cd backend
npm install
cp .env.example .env      # fill in ADMIN_PASSWORD_HASH and JWT_SECRET as above
npm start                 # backend on :5000, no gateway in front
```
Nginx can still be run separately pointed at `127.0.0.1:5000` if you want to demo the gateway
without Docker — see `nginx/nginx.conf` (swap the `backend:5000` upstream for `127.0.0.1:5000`).

## Viva-ready Q&A

**Q: Why Nginx instead of AWS API Gateway?**
Both satisfy "any API Gateway on any cloud" — Nginx was chosen so the whole stack (gateway +
backend + DB) is demoable with one `docker compose up`, without needing a cloud account or
incurring cost. The reverse-proxy/rate-limit/security-header responsibilities Nginx handles
here are the same responsibilities AWS API Gateway would handle; only the hosting differs.

**Q: Why is the backend port not published in docker-compose.yml?**
So the gateway is the *only* way in, which is the actual point of putting a gateway in front
of an API — bypassing it should not be possible in a real deployment.

**Q: Why JWT and not sessions?**
Sessions need server-side state (a session store), which conflicts with keeping the API
stateless/horizontally-scalable — the same reasoning that shaped Story 1. JWT keeps all the
auth state in the token itself.

**Q: What happens if the token expires mid-use?**
The request gets a `401` with `"Token has expired. Please log in again."` — the frontend
(Story 4) will need to catch that and redirect to a login screen.

**Q: Where would you take this if user management were in scope?**
Replace the single seeded admin with a `User` collection (mongo), hash passwords with bcrypt
per-user, add a `role` field, and use `req.user.role` in the auth middleware for
route-level authorization (e.g., only `admin` can delete records).
