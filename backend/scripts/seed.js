/**
 * Migration / seed script for the MongoDB-backed (stateful) build.
 *
 * MongoDB is schemaless at the storage engine level — collections and
 * indexes are created automatically on first write/connect via Mongoose
 * (see src/models/mongoSchemas.js for the declared schema/indexes). There
 * is no separate "run migrations" step like you'd need with a relational
 * database. This script instead:
 *   1. Confirms the declared indexes exist (createIndexes-safe on syncIndexes).
 *   2. Optionally seeds a small, self-consistent sample dataset so the
 *      stateful build can be demoed/tested immediately after deployment.
 *
 * Usage:
 *   cd backend
 *   USE_DB=true MONGO_URI="mongodb://127.0.0.1:27017/claims_management" node scripts/seed.js
 *   # add --wipe to clear existing data first, e.g.:
 *   node scripts/seed.js --wipe
 */
require("dotenv").config();
const connectDB = require("../src/config/db");
const { Policyholder, Policy, Claim } = require("../src/models/mongoSchemas");

async function run() {
  const wipe = process.argv.includes("--wipe");

  await connectDB();

  // Ensure indexes declared in the schemas (unique email/policyNumber/claimNumber
  // etc.) actually exist in the target database/cluster.
  await Promise.all([
    Policyholder.syncIndexes(),
    Policy.syncIndexes(),
    Claim.syncIndexes(),
  ]);
  console.log("Indexes synced.");

  if (wipe) {
    await Promise.all([Policyholder.deleteMany({}), Policy.deleteMany({}), Claim.deleteMany({})]);
    console.log("Existing data wiped.");
  }

  const existing = await Policyholder.countDocuments();
  if (existing > 0) {
    console.log(`Found ${existing} existing policyholder(s) — skipping seed (use --wipe to reseed).`);
    process.exit(0);
  }

  // Seed data is attributed to the admin account so it's visible to
  // whichever admin logs in, without implying it belongs to any one
  // regular user (see src/utils/ownership.js for the createdBy scoping).
  const seedOwner = process.env.ADMIN_USERNAME || "admin";

  const holder = await Policyholder.create({
    name: "Asha Verma",
    email: "asha.verma@example.com",
    phone: "9876543210",
    address: "12 MG Road, Jamshedpur, Jharkhand",
    dateOfBirth: "1990-04-12",
    createdBy: seedOwner,
  });

  const policy = await Policy.create({
    policyNumber: "POL-1001",
    policyholderId: holder._id,
    type: "Health",
    coverageAmount: 500000,
    premiumAmount: 12000,
    startDate: "2025-01-01",
    endDate: "2026-01-01",
    status: "Active",
    createdBy: seedOwner,
  });

  await Claim.create({
    claimNumber: "CLM-5001",
    policyId: policy._id,
    amountClaimed: 25000,
    description: "Hospitalization for minor surgery.",
    status: "Pending",
    createdBy: seedOwner,
  });

  console.log("Seed data created:");
  console.log({ policyholderId: holder._id.toString(), policyId: policy._id.toString() });

  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
