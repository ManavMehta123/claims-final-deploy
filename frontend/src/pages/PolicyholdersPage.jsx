import React, { useEffect, useState } from "react";
import { api } from "../api/api";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import SkeletonRows from "../components/SkeletonRows";
import { UsersIcon } from "../components/icons";
import { useToast } from "../components/ToastContext";
import { useAuth } from "../auth/AuthContext";

const EMPTY = { name: "", email: "", phone: "", address: "", dateOfBirth: "" };
const COLUMNS = 5;

const initials = (name) =>
  (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

export default function PolicyholdersPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [holders, setHolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalMode, setModalMode] = useState(null); // "create" | "edit" | null
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .listPolicyholders()
      .then(setHolders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm(EMPTY);
    setEditingId(null);
    setFormError(null);
    setModalMode("create");
  };

  const openEdit = (holder) => {
    setForm({ ...holder, dateOfBirth: holder.dateOfBirth ? holder.dateOfBirth.slice(0, 10) : "" });
    setEditingId(holder.id);
    setFormError(null);
    setModalMode("edit");
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      const payload = { ...form };
      if (!payload.dateOfBirth) delete payload.dateOfBirth;
      if (modalMode === "create") {
        await api.createPolicyholder(payload);
        toast.success("Policyholder created.");
      } else {
        await api.updatePolicyholder(editingId, payload);
        toast.success("Policyholder updated.");
      }
      setModalMode(null);
      load();
    } catch (err) {
      setFormError(err.details ? err.details.join(" | ") : err.message);
    }
  };

  const remove = async () => {
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await api.deletePolicyholder(id);
      toast.success("Policyholder deleted.");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Policyholders</h1>
          <p>People and entities covered under one or more policies.</p>
        </div>
        {!isAdmin && <button className="btn btn-primary" onClick={openCreate}>+ New Policyholder</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Phone</th><th>Address</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows columns={COLUMNS} />
              ) : (
                holders.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <div className="name-cell">
                        <span className="avatar">{initials(h.name)}</span>
                        {h.name}
                      </div>
                    </td>
                    <td className="cell-muted">{h.email}</td>
                    <td className="cell-mono">{h.phone}</td>
                    <td className="cell-muted">{h.address}</td>
                    <td className="cell-actions">
                      {!isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(h)}>Edit</button>}
                      {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => setPendingDelete(h)}>Delete</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && holders.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><UsersIcon width={20} height={20} /></div>
            <h3>No policyholders yet</h3>
            <p>Add the first policyholder to start issuing policies.</p>
            {!isAdmin && <button className="btn btn-primary" onClick={openCreate}>+ New Policyholder</button>}
          </div>
        )}
      </div>

      {modalMode && (
        <Modal title={modalMode === "create" ? "New Policyholder" : "Edit Policyholder"} onClose={() => setModalMode(null)}>
          <form onSubmit={submit}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-grid">
              <div className="form-field">
                <label>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Phone</label>
                <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              </div>
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Address</label>
                <textarea required rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{modalMode === "create" ? "Create" : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete policyholder?"
          message={`This will permanently remove ${pendingDelete.name}. This can't be undone.`}
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
