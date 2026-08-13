# Database Choice & Schema Design

## Choice: MongoDB (via Mongoose)

| Consideration | Reasoning |
|---|---|
| **Data shape** | Policyholder → Policy → Claim is a shallow, tree-shaped relationship (one holder has many policies, one policy has many claims). This maps naturally onto documents with a parent-id reference, without needing joins across many tables. |
| **Existing entity model** | `src/models/entities.js` already returns plain JS objects (not classes/rows), which is exactly what a MongoDB document looks like. This minimized the shape mismatch between the in-memory and database-backed repositories. |
| **Schema evolution** | The story's business rules (coverage limits, active-policy checks) live in the *application layer*, not the database, so we don't need strict relational constraints (foreign keys, joins) — just referential IDs, which MongoDB's `ObjectId` + `ref` handles well. |
| **Local/dev friction** | A single MongoDB connection string works the same locally, in Docker, or on Atlas (managed cloud) — no separate schema-migration tooling required for a project this size. |
| **Team familiarity / ecosystem** | Mongoose gives schema-level validation, unique indexes, and `.toJSON()` transforms, which let us keep the API response shape **byte-for-byte identical** to the in-memory version (see below), so the frontend and Postman collection needed zero changes. |

**Alternative considered:** PostgreSQL. It would have worked too (the data isn't relationally complex), but it would've required an ORM/migration framework (Prisma/Sequelize/Knex) to get equivalent schema validation, and buys nothing extra given there are no complex joins, transactions across many tables, or reporting/analytics needs in this story. MongoDB was chosen for lower setup overhead while keeping the same repository-pattern seam.

## Design principle: repository pattern seam

Controllers and routes only ever import from `src/repositories/index.js`. That file exposes exactly one decision point:

```js
const useDb = String(process.env.USE_DB).toLowerCase() === "true";
```

Everything else — validation, business rules, HTTP status codes, error shapes — is identical whether `USE_DB` is `true` or `false`. This is why the upgrade did not require touching `controllers/`, `routes/`, `validators/`, or the frontend at all.

## Schema design

### Policyholder
| Field | Type | Constraints |
|---|---|---|
| `_id` → `id` | ObjectId → string | primary key |
| name | String | required, 2–100 chars |
| email | String | required, unique, lowercase, email format |
| phone | String | required, pattern `^[0-9+\-\s]{7,15}$` |
| address | String | required, 5–250 chars |
| dateOfBirth | Date | optional |
| createdAt / updatedAt | Date | auto (Mongoose `timestamps`) |

### Policy
| Field | Type | Constraints |
|---|---|---|
| `_id` → `id` | ObjectId → string | primary key |
| policyNumber | String | required, unique |
| policyholderId | ObjectId | required, references Policyholder |
| type | String | enum: Life / Health / Vehicle / Property |
| coverageAmount | Number | required, > 0 |
| premiumAmount | Number | required, > 0 |
| startDate / endDate | Date | required; `endDate` validated > `startDate` |
| status | String | enum: Active / Expired / Cancelled (default Active) |

### Claim
| Field | Type | Constraints |
|---|---|---|
| `_id` → `id` | ObjectId → string | primary key |
| claimNumber | String | required, unique |
| policyId | ObjectId | required, references Policy |
| amountClaimed | Number | required, > 0 |
| dateOfClaim | Date | defaults to now |
| description | String | required, 5–500 chars |
| status | String | enum: Pending / Approved / Rejected (default Pending) |

### Response shape compatibility
Each schema defines a shared `toJSON` transform that renames Mongo's `_id` → `id` and strips Mongoose's internal `__v` version key, so every JSON response from the stateful backend matches the stateless backend's shape exactly (`{ id, name, email, ... }`, no underscores).

### Indexes / uniqueness
`email` (Policyholder), `policyNumber` (Policy), and `claimNumber` (Claim) are declared `unique: true` at the schema level. The application layer still checks for duplicates proactively (to return a friendly `409` with a clear message before hitting the database), and the unique index is the safety net for race conditions — duplicate-key errors (Mongo error code `11000`) are caught centrally in `src/middleware/errorHandler.js` and turned into a `409 DuplicateKey` response.

### Validation layers (defense in depth)
1. **Joi** (`src/validators/schemas.js`) — validates the HTTP request body shape before it reaches a controller.
2. **Mongoose schema validation** — re-validates at the persistence layer (`required`, `min`, `enum`, custom `endDate > startDate` validator), so direct repository use or programmatic writes can't bypass the rules either.
3. **Application-layer business rules** in the controllers (duplicate email/policyNumber, active-policy check, coverage-limit check) — unchanged from Story 1, and they still run identically because the repository interface didn't change.
