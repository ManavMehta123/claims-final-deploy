const { v4: uuid } = require("uuid");
const { newClaim } = require("../../models/entities");

const store = new Map();

// `ownerUsername`, where accepted below, is optional: pass it to scope the
// query to records created by that user; omit it (or pass undefined) for
// an unscoped/admin view.
module.exports = {
  async create(data) {
    const id = uuid();
    const record = newClaim({ id, ...data });
    store.set(id, record);
    return record;
  },
  async findAll(ownerUsername) {
    const all = Array.from(store.values());
    return ownerUsername ? all.filter((c) => c.createdBy === ownerUsername) : all;
  },
  async findById(id) {
    return store.get(id) || null;
  },
  async findByPolicyId(policyId, ownerUsername) {
    return Array.from(store.values()).filter(
      (c) => c.policyId === policyId && (!ownerUsername || c.createdBy === ownerUsername)
    );
  },
  async update(id, data) {
    const existing = store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, id };
    store.set(id, updated);
    return updated;
  },
  async remove(id) {
    return store.delete(id);
  },
  async _reset() {
    store.clear();
  },
};
