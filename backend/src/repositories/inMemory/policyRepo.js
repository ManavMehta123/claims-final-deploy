const { v4: uuid } = require("uuid");
const { newPolicy } = require("../../models/entities");

const store = new Map();

// `ownerUsername`, where accepted below, is optional: pass it to scope the
// query to records created by that user; omit it (or pass undefined) for
// an unscoped/admin view.
module.exports = {
  async create(data) {
    const id = uuid();
    const record = newPolicy({ id, ...data });
    store.set(id, record);
    return record;
  },
  async findAll(ownerUsername) {
    const all = Array.from(store.values());
    return ownerUsername ? all.filter((p) => p.createdBy === ownerUsername) : all;
  },
  async findById(id) {
    return store.get(id) || null;
  },
  async findByPolicyNumber(policyNumber) {
    return Array.from(store.values()).find((p) => p.policyNumber === policyNumber) || null;
  },
  async findByPolicyholderId(policyholderId, ownerUsername) {
    return Array.from(store.values()).filter(
      (p) => p.policyholderId === policyholderId && (!ownerUsername || p.createdBy === ownerUsername)
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
