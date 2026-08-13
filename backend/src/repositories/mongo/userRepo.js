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
  async _reset() {
    await User.deleteMany({});
  },
};
