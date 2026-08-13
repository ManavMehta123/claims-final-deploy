# Deployment Guide (Stateful build)

This deploys the MongoDB-backed backend + the React frontend using free-tier cloud services:
**MongoDB Atlas** (database), **Render** (backend API), **Vercel or Render Static Site**
(frontend). Any equivalent host works the same way — the only requirement is that the
backend process has `USE_DB=true` and `MONGO_URI` set as environment variables.

## 1. Database — MongoDB Atlas

1. Create a free account at https://www.mongodb.com/cloud/atlas and a free (M0) cluster.
2. Under **Database Access**, create a user with a password.
3. Under **Network Access**, add `0.0.0.0/0` (or your host's IP) so the deployed backend can
   reach it.
4. Click **Connect → Drivers** and copy the connection string, e.g.:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/claims_management?retryWrites=true&w=majority
   ```

## 2. Backend — Render (Web Service)

1. Push this repository to GitHub (see `docs/PR_DESCRIPTION.md` — merge the
   `feature/mongodb-persistence` branch to `main` first).
2. On https://render.com, click **New → Web Service**, connect the GitHub repo.
3. Settings:
   - **Root directory:** `backend`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Add environment variables:
   | Key | Value |
   |---|---|
   | `USE_DB` | `true` |
   | `MONGO_URI` | *(the Atlas connection string from step 1)* |
   | `PORT` | `10000` *(Render sets this automatically; `server.js` already reads `process.env.PORT`)* |
5. Deploy. Confirm `GET https://<your-service>.onrender.com/health` returns
   `{"status":"ok","mode":"stateful (MongoDB)"}`.
6. (Optional, once only) Run the seed script against the same `MONGO_URI` from your local
   machine to pre-populate sample data:
   ```bash
   MONGO_URI="<atlas-uri>" USE_DB=true node backend/scripts/seed.js
   ```

## 3. Frontend — Render Static Site (or Vercel)

1. **New → Static Site**, same GitHub repo.
2. Settings:
   - **Root directory:** `frontend`
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `dist`
3. Add a rewrite/proxy so `/api/*` calls reach the backend service instead of 404ing — either:
   - Set `VITE_API_BASE` (if you add it to `frontend/src/api/api.js`) to the full Render
     backend URL, **or**
   - Add a rewrite rule in Render's static site settings: `/api/*` → `https://<backend-service>.onrender.com/api/:splat`.

## 4. Verify end-to-end

1. Open the deployed frontend URL.
2. Create a policyholder, a policy, and a claim through the UI.
3. Restart the backend service on Render (Manual Deploy → "Clear cache & deploy", or just
   trigger a restart) and reload the frontend — the data you created should still be there,
   proving the app is now stateful.

## Notes

- No code changes are needed to switch environments — only the two env vars (`USE_DB`,
  `MONGO_URI`) differ between local, staging, and production.
- To roll back to stateless at any time (e.g. for a quick demo without a DB), set
  `USE_DB=false` and redeploy — no data migration needed since it's a completely separate
  code path behind the same API contract.
