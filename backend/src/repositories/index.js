// Repository seam: controllers/routes only ever import from here and never
// know or care whether records live in memory or in MongoDB. Toggle with
// the USE_DB env var (see .env.example).
const useDb = String(process.env.USE_DB).toLowerCase() === "true";

const policyholderRepo = useDb
  ? require("./mongo/policyholderRepo")
  : require("./inMemory/policyholderRepo");

const policyRepo = useDb ? require("./mongo/policyRepo") : require("./inMemory/policyRepo");

const claimRepo = useDb ? require("./mongo/claimRepo") : require("./inMemory/claimRepo");

const userRepo = useDb ? require("./mongo/userRepo") : require("./inMemory/userRepo");

module.exports = { policyholderRepo, policyRepo, claimRepo, userRepo, useDb };
