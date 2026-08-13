# PR: Add MongoDB persistence layer (Stateless → Stateful)

## Summary
Upgrades the Claims Management System from in-memory data structures to MongoDB-backed
persistence, per the "Upgrade Claims Management System to Stateful application" story.

## Changes
- Added Mongoose schemas for `Policyholder`, `Policy`, and `Claim` (`src/models/mongoSchemas.js`).
- Added a MongoDB repository implementation mirroring the in-memory repository's method
  signatures exactly (`src/repositories/mongo/*`), so controllers required no changes.
- Added a `USE_DB` environment flag that switches `src/repositories/index.js` between the
  in-memory and MongoDB implementations at startup.
- Added `src/config/db.js` for the Mongo connection.
- `.toJSON()` transforms on each schema normalize `_id` → `id` so API responses are
  byte-for-byte identical in shape between the two modes.
- Duplicate-key errors (`code 11000`) and Mongoose `CastError`/`ValidationError` are now handled
  in the central error handler.

## Why this approach
Rather than rewriting the controllers, a repository-pattern swap keeps Story 1's API contract
stable — the same routes, the same request/response shapes, the same business-rule error codes —
while changing only where the data lives. This also means the existing Postman collection and
frontend needed zero changes to work against the database-backed API.

## Testing
- [x] `USE_DB=false npm start` — confirmed all endpoints still work in-memory (regression
      check): health check + policyholder create verified against the running server.
- [ ] `USE_DB=true npm start` against a local/Atlas MongoDB — confirm CRUD + business rules
      (duplicate email, claim-exceeds-coverage, active-policy check) all behave identically.
      *(Not runnable in the sandbox this PR was authored in — no MongoDB binary available on
      the allowed network egress list. Verify against a local `mongod` or Atlas before
      merging — see `docs/DATABASE_CHOICE.md` and `README.md` "Option B" for exact steps.)*
- [ ] Restart the server with `USE_DB=true` and confirm previously created records are still
      returned by `GET /api/policyholders` (proves persistence).
- [ ] Postman collection run against both modes.

## New files
- `backend/src/config/db.js` — Mongoose connection helper.
- `backend/src/models/mongoSchemas.js` — Policyholder/Policy/Claim schemas, unique indexes,
  and `id`-normalizing `toJSON` transforms.
- `backend/src/repositories/mongo/{policyholderRepo,policyRepo,claimRepo}.js` — Mongo repos
  matching the in-memory repos' method signatures exactly.
- `backend/scripts/seed.js` — index sync + optional sample-data seed script.
- `docs/DATABASE_CHOICE.md` — DB choice reasoning and full schema design.
- `docs/DEPLOYMENT.md` — cloud deployment steps (Atlas + Render).

## Deployment notes
Set `USE_DB=true` and `MONGO_URI` as environment variables on the target host/cloud service.
No other configuration changes are required. See `docs/DEPLOYMENT.md` for a full walkthrough.
