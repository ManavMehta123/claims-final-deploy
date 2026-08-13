const { policyholderRepo } = require("../repositories");
const { ownerScope, canAccess } = require("../utils/ownership");

exports.create = async (req, res, next) => {
  try {
    const existing = await policyholderRepo.findByEmail(req.body.email);
    if (existing) {
      return res.status(409).json({ error: "DuplicateEmail", message: "A policyholder with this email already exists." });
    }
    const created = await policyholderRepo.create({ ...req.body, createdBy: req.user.sub });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

exports.findAll = async (req, res, next) => {
  try {
    res.json(await policyholderRepo.findAll(ownerScope(req)));
  } catch (err) {
    next(err);
  }
};

exports.findOne = async (req, res, next) => {
  try {
    const record = await policyholderRepo.findById(req.params.id);
    if (!record || !canAccess(req, record)) {
      return res.status(404).json({ error: "NotFound", message: "Policyholder not found." });
    }
    res.json(record);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const existing = await policyholderRepo.findById(req.params.id);
    if (!existing || !canAccess(req, existing)) {
      return res.status(404).json({ error: "NotFound", message: "Policyholder not found." });
    }
    if (req.body.email) {
      const existingByEmail = await policyholderRepo.findByEmail(req.body.email);
      if (existingByEmail && existingByEmail.id !== req.params.id) {
        return res.status(409).json({ error: "DuplicateEmail", message: "Email already used by another policyholder." });
      }
    }
    const updated = await policyholderRepo.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "NotFound", message: "Policyholder not found." });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const existing = await policyholderRepo.findById(req.params.id);
    if (!existing || !canAccess(req, existing)) {
      return res.status(404).json({ error: "NotFound", message: "Policyholder not found." });
    }
    const { policyRepo } = require("../repositories");
    const policies = await policyRepo.findByPolicyholderId(req.params.id);
    if (policies.length > 0) {
      return res.status(409).json({
        error: "HasDependentPolicies",
        message: "Cannot delete a policyholder who still has policies. Delete or reassign their policies first.",
      });
    }
    const deleted = await policyholderRepo.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: "NotFound", message: "Policyholder not found." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
