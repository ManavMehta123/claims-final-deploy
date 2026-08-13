const { v4: uuid } = require("uuid");
const { newUser } = require("../../models/entities");

// In-memory store — resets on server restart, same as the other Story 1
// repositories. Newly registered users disappear when the server restarts.
const store = new Map();

module.exports = {
  async create(data) {
    const id = uuid();
    const record = newUser({ id, ...data });
    store.set(id, record);
    return record;
  },
  async findByUsername(username) {
    const target = username.toLowerCase();
    return Array.from(store.values()).find((u) => u.username.toLowerCase() === target) || null;
  },
  async findByEmail(email) {
    const target = email.toLowerCase();
    return Array.from(store.values()).find((u) => u.email.toLowerCase() === target) || null;
  },
  async findById(id) {
    return store.get(id) || null;
  },
  async _reset() {
    store.clear();
  },
};
