const { Policyholder } = require("../../models/mongoSchemas");

// Same method signatures as repositories/inMemory/policyholderRepo.js so
// controllers work unmodified regardless of which repo is wired up.
//
// `ownerUsername`, where accepted below, is optional: pass it to scope the
// query to records created by that user; omit it (or pass undefined) for
// an unscoped/admin view.
module.exports = {
  async create(data) {
    const doc = await Policyholder.create(data);
    return doc.toJSON();
  },
  async findAll(ownerUsername) {
    const filter = ownerUsername ? { createdBy: ownerUsername } : {};
    const docs = await Policyholder.find(filter).sort({ createdAt: 1 });
    return docs.map((d) => d.toJSON());
  },
  async findById(id) {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return null;
    const doc = await Policyholder.findById(id);
    return doc ? doc.toJSON() : null;
  },
  async findByEmail(email) {
    const doc = await Policyholder.findOne({ email: email.toLowerCase() });
    return doc ? doc.toJSON() : null;
  },
  async update(id, data) {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return null;
    const doc = await Policyholder.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
      context: "query",
    });
    return doc ? doc.toJSON() : null;
  },
  async remove(id) {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return false;
    const doc = await Policyholder.findByIdAndDelete(id);
    return !!doc;
  },
  async _reset() {
    await Policyholder.deleteMany({});
  },
};
