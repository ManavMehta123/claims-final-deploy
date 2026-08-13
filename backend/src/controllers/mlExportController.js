const { claimRepo, policyRepo, useDb } = require("../repositories");

// Only claims with a final human decision are usable as training labels —
// a Pending claim has no known Condition/Amount yet.
const RESOLVED_STATUSES = new Set(["Approved", "Rejected"]);

/**
 * Shapes one resolved claim (+ its policy's end date) into exactly the
 * feature/label schema train.py expects (see ml-service/train.py
 * ALL_FEATURES + Condition/Amount). Keeping this mapping on the backend
 * means the ingestion job on the ML side never has to know about Mongo
 * or the Claim/Policy schemas — it just consumes flat rows.
 */
function toTrainingRow(claim, policy) {
  return {
    claimId: claim.id,
    Insurance_company: claim.insuranceCompany || "",
    Cost_of_vehicle: claim.costOfVehicle,
    Min_coverage: claim.minCoverage,
    Max_coverage: claim.maxCoverage,
    // The original training data's Expiry_date is the insurance policy's
    // expiry — the same meaning applies here via the claim's linked policy.
    Expiry_date: policy ? policy.endDate : null,
    Condition: claim.status === "Approved" ? 1 : 0,
    Amount: claim.status === "Approved" ? claim.amountClaimed : null,
    // Watermark field the ingestion job uses to only pull what's new since
    // its last run (see ml-service/ingestion/ingest.py).
    decidedAt: claim.updatedAt || claim.dateOfClaim,
  };
}

exports.trainingExport = async (req, res, next) => {
  try {
    if (!useDb) {
      // The in-memory repo has nothing durable to feed a retraining
      // pipeline from (it resets on every restart), and there's no
      // updatedAt watermark to page through — so this endpoint only makes
      // sense in stateful (MongoDB) mode.
      return res.status(501).json({
        error: "NotSupported",
        message: "Training data export requires stateful mode (USE_DB=true / MongoDB).",
      });
    }

    const since = req.query.since ? new Date(req.query.since) : null;
    if (req.query.since && Number.isNaN(since?.getTime())) {
      return res.status(400).json({ error: "InvalidInput", message: "since must be a valid ISO date." });
    }

    const claims = await claimRepo.findAll();
    const resolved = claims.filter((c) => RESOLVED_STATUSES.has(c.status));

    // Batch-resolve policies (small dedup cache) instead of one query per claim.
    const policyCache = new Map();
    const rows = [];
    for (const claim of resolved) {
      const decidedAt = new Date(claim.updatedAt || claim.dateOfClaim);
      if (since && decidedAt <= since) continue;

      if (!policyCache.has(claim.policyId)) {
        policyCache.set(claim.policyId, await policyRepo.findById(claim.policyId));
      }
      rows.push(toTrainingRow(claim, policyCache.get(claim.policyId)));
    }

    rows.sort((a, b) => new Date(a.decidedAt) - new Date(b.decidedAt));
    res.json({ count: rows.length, since: req.query.since || null, rows });
  } catch (err) {
    next(err);
  }
};
