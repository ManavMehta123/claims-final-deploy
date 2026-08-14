const mongoose = require("mongoose");
const { STATUS } = require("./entities");

// Shared toJSON transform: expose `id` (string) instead of Mongo's `_id`
// so every response is byte-for-byte identical in shape to the in-memory
// (stateless) API, regardless of USE_DB. Controllers never need to know
// which mode they're running in.
const toJSON = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
  },
};

const policyholderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, minlength: 2, maxlength: 100, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format."],
    },
    phone: {
      type: String,
      required: true,
      match: [/^[0-9+\-\s]{7,15}$/, "Invalid phone format."],
    },
    address: { type: String, required: true, minlength: 5, maxlength: 250 },
    dateOfBirth: { type: Date, default: null },
    // Username of the account that created this record. Regular users only
    // see/edit records where createdBy matches their own username; admins
    // see everything regardless of this field.
    createdBy: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true, toJSON, toObject: toJSON }
);

const policySchema = new mongoose.Schema(
  {
    policyNumber: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    policyholderId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Policyholder" },
    type: { type: String, required: true, enum: ["Life", "Health", "Vehicle", "Property"] },
    coverageAmount: { type: Number, required: true, min: 0.01 },
    premiumAmount: { type: Number, required: true, min: 0.01 },
    startDate: { type: Date, required: true },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return value > this.startDate;
        },
        message: "endDate must be after startDate.",
      },
    },
    status: {
      type: String,
      enum: Object.values(STATUS.POLICY),
      default: STATUS.POLICY.ACTIVE,
    },
    createdBy: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true, toJSON, toObject: toJSON }
);

const claimSchema = new mongoose.Schema(
  {
    claimNumber: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    policyId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Policy" },
    amountClaimed: { type: Number, required: true, min: 0.01 },
    dateOfClaim: { type: Date, default: () => new Date() },
    description: { type: String, required: true, minlength: 5, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(STATUS.CLAIM),
      default: STATUS.CLAIM.PENDING,
    },
    imageName: { type: String, trim: true, maxlength: 255, default: "" },
    imageMimeType: { type: String, trim: true, maxlength: 100, default: "" },
    imageData: { type: String, default: "" },
    // Captured at filing time so the admin's ML/Gemini prediction step can
    // reuse it later instead of the admin retyping it from scratch.
    insuranceCompany: { type: String, trim: true, maxlength: 10, default: "" },
    costOfVehicle: { type: Number, min: 0, default: null },
    minCoverage: { type: Number, min: 0, default: null },
    maxCoverage: { type: Number, min: 0, default: null },
    createdBy: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true, toJSON, toObject: toJSON }
);

// policyholderId/policyId arrive from the client as plain id strings (same
// shape the in-memory repo expects) — Mongoose casts them to ObjectId
// automatically, and a bad id surfaces as a CastError (handled centrally).

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format."],
    },
    // Bcrypt hash only — the plaintext password is never persisted.
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    // Forgot-password support. We store a hash of the reset token (never
    // the raw token) plus its expiry, directly on this same user document —
    // resetting a password only ever updates passwordHash on the existing
    // record, it never creates a new user or touches their claims/policies.
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON, toObject: toJSON }
);

const Policyholder = mongoose.models.Policyholder || mongoose.model("Policyholder", policyholderSchema);
const Policy = mongoose.models.Policy || mongoose.model("Policy", policySchema);
const Claim = mongoose.models.Claim || mongoose.model("Claim", claimSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { Policyholder, Policy, Claim, User };
