const Joi = require("joi");

const policyholderSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string()
    .pattern(/^[0-9+\-\s]{7,15}$/)
    .required(),
  address: Joi.string().min(5).max(250).required(),
  dateOfBirth: Joi.date().less("now").optional(),
});

const policyholderUpdateSchema = policyholderSchema.fork(
  ["name", "email", "phone", "address"],
  (s) => s.optional()
);

const policySchema = Joi.object({
  policyNumber: Joi.string().min(3).max(30).required(),
  policyholderId: Joi.string().required(),
  type: Joi.string().valid("Life", "Health", "Vehicle", "Property").required(),
  coverageAmount: Joi.number().positive().required(),
  premiumAmount: Joi.number().positive().required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref("startDate")).required(),
  status: Joi.string().valid("Active", "Expired", "Cancelled").optional(),
});

const policyUpdateSchema = policySchema.fork(
  ["policyNumber", "policyholderId", "type", "coverageAmount", "premiumAmount", "startDate", "endDate"],
  (s) => s.optional()
);

const claimSchema = Joi.object({
  claimNumber: Joi.string().min(3).max(30).required(),
  policyId: Joi.string().required(),
  amountClaimed: Joi.number().positive().required(),
  dateOfClaim: Joi.date().optional(),
  description: Joi.string().min(5).max(500).required(),
  status: Joi.string().valid("Pending", "Approved", "Rejected").optional(),
  imageName: Joi.string().max(255).optional().allow(""),
  imageMimeType: Joi.string().max(100).optional().allow(""),
  imageData: Joi.string().base64().optional().allow(""),
  // Captured at filing time so the admin's ML/Gemini prediction step can
  // reuse it later instead of the admin retyping it from scratch.
  insuranceCompany: Joi.string().max(10).optional().allow(""),
  costOfVehicle: Joi.number().positive().optional(),
  minCoverage: Joi.number().positive().optional(),
  maxCoverage: Joi.number().positive().optional(),
});

const claimUpdateSchema = claimSchema.fork(
  ["claimNumber", "policyId", "amountClaimed", "description", "dateOfClaim", "imageName", "imageMimeType", "imageData"],
  (s) => s.optional()
);

const registerSchema = Joi.object({
  username: Joi.string()
    .pattern(/^[a-zA-Z0-9_.]+$/)
    .min(3)
    .max(30)
    .required()
    .messages({ "string.pattern.base": "username may only contain letters, numbers, underscores, and dots." }),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(72).required(),
  // Self-selected at signup (Story 5). Defaults to "user" if omitted so
  // existing API clients/tests that don't send it keep working unchanged.
  role: Joi.string().valid("user", "admin").optional().default("user"),
});

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

const claimPredictionSchema = Joi.object({
  Insurance_company: Joi.string().min(1).max(10).required(),
  Cost_of_vehicle: Joi.number().positive().required(),
  Min_coverage: Joi.number().positive().required(),
  Max_coverage: Joi.number().positive().required(),
  Expiry_date: Joi.date().required(),
  description: Joi.string().max(500).optional().allow(""),
  imageName: Joi.string().max(255).optional().allow(""),
  imageMimeType: Joi.string().max(100).optional().allow(""),
  imageData: Joi.string().base64().optional().allow(""),
});

module.exports = {
  policyholderSchema,
  policyholderUpdateSchema,
  policySchema,
  policyUpdateSchema,
  claimSchema,
  claimUpdateSchema,
  registerSchema,
  loginSchema,
  claimPredictionSchema,
};
