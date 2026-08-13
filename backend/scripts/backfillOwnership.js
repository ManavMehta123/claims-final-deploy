/**
 * One-time migration for existing MongoDB data created before the
 * per-user ownership fix (createdBy field on Policyholder/Policy/Claim).
 *
 * Any pre-existing record has no createdBy set, so it would now fail
 * validation on update and would be invisible to every non-admin user's
 * findAll() (which filters by createdBy). This script assigns a fallback
 * owner to any record missing the field so nothing is silently lost.
 *
 * Usage:
 *   cd backend
 *   USE_DB=true MONGO_URI="mongodb://127.0.0.1:27017/claims_management" \
 *     node scripts/backfillOwnership.js [--owner <username>]
 *
 * Defaults --owner to ADMIN_USERNAME (or "admin") so legacy shared data
 * ends up owned by the admin account, which can see everything anyway.
 * Re-run safely — it only touches documents where createdBy is missing.
 */
require("dotenv").config();
const connectDB = require("../src/config/db");
const { Policyholder, Policy, Claim } = require("../src/models/mongoSchemas");

async function run() {
  const ownerFlagIndex = process.argv.indexOf("--owner");
  const owner = ownerFlagIndex !== -1 ? process.argv[ownerFlagIndex + 1] : process.env.ADMIN_USERNAME || "admin";

  await connectDB();

  const filter = { $or: [{ createdBy: { $exists: false } }, { createdBy: null }, { createdBy: "" }] };
  const update = { $set: { createdBy: owner } };

  const [holders, policies, claims] = await Promise.all([
    Policyholder.updateMany(filter, update),
    Policy.updateMany(filter, update),
    Claim.updateMany(filter, update),
  ]);

  console.log(`Backfilled createdBy="${owner}" on:`);
  console.log(`  Policyholders: ${holders.modifiedCount}`);
  console.log(`  Policies:      ${policies.modifiedCount}`);
  console.log(`  Claims:        ${claims.modifiedCount}`);

  process.exit(0);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
