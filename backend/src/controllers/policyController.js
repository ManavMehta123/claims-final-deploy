const { policyRepo, policyholderRepo } = require("../repositories");

// Policies are shared across all logged-in users (unlike policyholders and
// claims, which are scoped to their creator — see src/utils/ownership.js).
// `createdBy` is still stamped on create for audit purposes, but it is
// never used to filter or restrict access here.

exports.create = async (req, res, next) => {
  try {
    const holder = await policyholderRepo.findById(req.body.policyholderId);
    if (!holder) {
      return res.status(400).json({ error: "InvalidReference", message: "policyholderId does not refer to an existing policyholder." });
    }
    const existingNumber = await policyRepo.findByPolicyNumber(req.body.policyNumber);
    if (existingNumber) {
      return res.status(409).json({ error: "DuplicatePolicyNumber", message: "A policy with this policyNumber already exists." });
    }
    const created = await policyRepo.create({ ...req.body, createdBy: req.user.sub });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

exports.findAll = async (req, res, next) => {
  try {
    if (req.query.policyholderId) {
      return res.json(await policyRepo.findByPolicyholderId(req.query.policyholderId));
    }
    res.json(await policyRepo.findAll());
  } catch (err) {
    next(err);
  }
};

exports.findOne = async (req, res, next) => {
  try {
    const record = await policyRepo.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "NotFound", message: "Policy not found." });
    res.json(record);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    if (req.body.policyNumber) {
      const existingByNumber = await policyRepo.findByPolicyNumber(req.body.policyNumber);
      if (existingByNumber && existingByNumber.id !== req.params.id) {
        return res.status(409).json({ error: "DuplicatePolicyNumber", message: "policyNumber already in use." });
      }
    }
    const updated = await policyRepo.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "NotFound", message: "Policy not found." });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { claimRepo } = require("../repositories");
    const claims = await claimRepo.findByPolicyId(req.params.id);
    if (claims.length > 0) {
      return res.status(409).json({
        error: "HasDependentClaims",
        message: "Cannot delete a policy that has claims filed against it.",
      });
    }
    const deleted = await policyRepo.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: "NotFound", message: "Policy not found." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
