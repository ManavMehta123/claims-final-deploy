import React, { useEffect, useState } from "react";
import { api } from "../api/api";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import SkeletonRows from "../components/SkeletonRows";
import { ShieldIcon } from "../components/icons";
import { useToast } from "../components/ToastContext";
import { useAuth } from "../auth/AuthContext";

const EMPTY = {
  policyNumber: "",
  policyholderId: "",
  type: "Health",
  coverageAmount: "",
  premiumAmount: "",
  startDate: "",
  endDate: "",
  status: "Active",
};
const COLUMNS = 7;

export default function PoliciesPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [holders, setHolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.listPolicies(), api.listPolicyholders()])
      .then(([p, h]) => { setPolicies(p); setHolders(h); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const holderName = (id) => holders.find((h) => h.id === id)?.name || "—";

  const openCreate = () => {
    setForm({ ...EMPTY, policyholderId: holders[0]?.id || "" });
    setEditingId(null);
    setFormError(null);
    setModalMode("create");
  };

  const openEdit = (p) => {
    setForm({ ...p, startDate: p.startDate.slice(0, 10), endDate: p.endDate.slice(0, 10) });
    setEditingId(p.id);
    setFormError(null);
    setModalMode("edit");
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      const payload = {
        ...form,
        coverageAmount: Number(form.coverageAmount),
        premiumAmount: Number(form.premiumAmount),
      };
      if (modalMode === "create") {
        await api.createPolicy(payload);
        toast.success("Policy created.");
      } else {
        await api.updatePolicy(editingId, payload);
        toast.success("Policy updated.");
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
      await api.deletePolicy(id);
      toast.success("Policy deleted.");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Policies</h1>
          <p>Coverage issued to policyholders, with term and premium details.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate} disabled={holders.length === 0}>+ New Policy</button>
        )}
      </div>

      {holders.length === 0 && !loading && (
        <div className="alert alert-info">Create a policyholder first before adding a policy.</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Policy #</th><th>Holder</th><th>Type</th><th>Coverage</th><th>Term</th><th>Status</th>{isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows columns={COLUMNS} />
              ) : (
                policies.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-mono">{p.policyNumber}</td>
                    <td>{holderName(p.policyholderId)}</td>
                    <td>{p.type}</td>
                    <td className="cell-mono">₹{p.coverageAmount.toLocaleString("en-IN")}</td>
                    <td className="cell-mono cell-muted">{p.startDate.slice(0, 10)} → {p.endDate.slice(0, 10)}</td>
                    <td><Badge status={p.status} /></td>
                    {isAdmin && (
                      <td className="cell-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setPendingDelete(p)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && policies.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><ShieldIcon width={20} height={20} /></div>
            <h3>No policies yet</h3>
            <p>Issue the first policy to a policyholder to get started.</p>
            {holders.length > 0 && (
              <button className="btn btn-primary" onClick={openCreate}>+ New Policy</button>
            )}
          </div>
        )}
      </div>

      {modalMode && (
        <Modal title={modalMode === "create" ? "New Policy" : "Edit Policy"} onClose={() => setModalMode(null)}>
          <form onSubmit={submit}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-grid">
              <div className="form-field">
                <label>Policy Number</label>
                <input required value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Policyholder</label>
                <select required value={form.policyholderId} onChange={(e) => setForm({ ...form, policyholderId: e.target.value })}>
                  {holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {["Life", "Health", "Vehicle", "Property"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {["Active", "Expired", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Coverage Amount (₹)</label>
                <input required type="number" min="1" value={form.coverageAmount} onChange={(e) => setForm({ ...form, coverageAmount: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Premium Amount (₹)</label>
                <input required type="number" min="1" value={form.premiumAmount} onChange={(e) => setForm({ ...form, premiumAmount: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Start Date</label>
                <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="form-field">
                <label>End Date</label>
                <input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
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
          title="Delete policy?"
          message={`This will permanently remove policy ${pendingDelete.policyNumber}. This can't be undone.`}
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
