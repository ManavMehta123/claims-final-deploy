const { claimRepo, policyRepo } = require("../repositories");
const { ownerScope, canAccess } = require("../utils/ownership");

// Policies are shared across all users (see policyController.js), so any
// authenticated user may file a claim against any existing policy — the
// claim itself is still scoped to whoever created it.

// Business rule: sum of all non-rejected claims against a policy cannot
// exceed that policy's coverage amount. Returns the amount already
// consumed so callers can compute remaining balance / include it in errors.
async function consumedAmount(policyId, excludeClaimId = null) {
  const claims = await claimRepo.findByPolicyId(policyId);
  return claims
    .filter((c) => c.status !== "Rejected" && c.id !== excludeClaimId)
    .reduce((sum, c) => sum + c.amountClaimed, 0);
}

exports.create = async (req, res, next) => {
  try {
    const policy = await policyRepo.findById(req.body.policyId);
    if (!policy) {
      return res.status(400).json({ error: "InvalidReference", message: "policyId does not refer to an existing policy." });
    }
    if (policy.status !== "Active") {
      return res.status(422).json({ error: "PolicyNotActive", message: `Policy status is '${policy.status}'. Claims can only be filed against active policies.` });
    }
    const already = await consumedAmount(policy.id);
    const remaining = policy.coverageAmount - already;
    if (req.body.amountClaimed > remaining) {
      return res.status(422).json({
        error: "ClaimExceedsCoverage",
        message: `Claim amount (${req.body.amountClaimed}) exceeds the policy's remaining coverage (${remaining}).`,
        coverageAmount: policy.coverageAmount,
        alreadyClaimed: already,
        remainingCoverage: remaining,
      });
    }
    const created = await claimRepo.create({ ...req.body, createdBy: req.user.sub });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

exports.findAll = async (req, res, next) => {
  try {
    const scope = ownerScope(req);
    if (req.query.policyId) {
      return res.json(await claimRepo.findByPolicyId(req.query.policyId, scope));
    }
    res.json(await claimRepo.findAll(scope));
  } catch (err) {
    next(err);
  }
};

exports.findOne = async (req, res, next) => {
  try {
    const record = await claimRepo.findById(req.params.id);
    if (!record || !canAccess(req, record)) {
      return res.status(404).json({ error: "NotFound", message: "Claim not found." });
    }
    res.json(record);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const existing = await claimRepo.findById(req.params.id);
    if (!existing || !canAccess(req, existing)) {
      return res.status(404).json({ error: "NotFound", message: "Claim not found." });
    }

    // Re-validate the coverage rule if the amount is changing (or being re-approved).
    if (req.body.amountClaimed !== undefined) {
      const policy = await policyRepo.findById(existing.policyId);
      const already = await consumedAmount(policy.id, existing.id);
      const remaining = policy.coverageAmount - already;
      if (req.body.amountClaimed > remaining) {
        return res.status(422).json({
          error: "ClaimExceedsCoverage",
          message: `Updated claim amount (${req.body.amountClaimed}) exceeds the policy's remaining coverage (${remaining}).`,
          remainingCoverage: remaining,
        });
      }
    }

    const updated = await claimRepo.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const existing = await claimRepo.findById(req.params.id);
    if (!existing || !canAccess(req, existing)) {
      return res.status(404).json({ error: "NotFound", message: "Claim not found." });
    }
    const deleted = await claimRepo.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: "NotFound", message: "Claim not found." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
