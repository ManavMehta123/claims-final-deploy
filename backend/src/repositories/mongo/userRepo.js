const { User } = require("../../models/mongoSchemas");

// Same method signatures as repositories/inMemory/userRepo.js so
// controllers work unmodified regardless of which repo is wired up.
module.exports = {
  async create(data) {
    const doc = await User.create(data);
    return doc.toJSON();
  },
  async findByUsername(username) {
    const doc = await User.findOne({ username: new RegExp(`^${username}$`, "i") });
    return doc ? doc.toJSON() : null;
  },
  async findByEmail(email) {
    const doc = await User.findOne({ email: email.toLowerCase() });
    return doc ? doc.toJSON() : null;
  },
  async findById(id) {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return null;
    const doc = await User.findById(id);
    return doc ? doc.toJSON() : null;
  },
  async setResetToken(userId, resetTokenHash, resetTokenExpiresAt) {
    await User.findByIdAndUpdate(userId, { resetTokenHash, resetTokenExpiresAt });
  },
  // Only ever matched against non-expired hashes, so an old/used token
  // can never resolve to a user even if resetTokenHash briefly overlaps.
  async findByValidResetTokenHash(resetTokenHash) {
    const doc = await User.findOne({ resetTokenHash, resetTokenExpiresAt: { $gt: new Date() } });
    return doc ? doc.toJSON() : null;
  },
  // Updates the password on the SAME user record and clears the used
  // token in one step — the account (and everything tied to it) never
  // changes identity.
  async updatePasswordAndClearToken(userId, passwordHash) {
    await User.findByIdAndUpdate(userId, {
      passwordHash,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    });
  },
  async _reset() {
    await User.deleteMany({});
  },
};
