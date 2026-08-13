import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/api";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import SkeletonRows from "../components/SkeletonRows";
import { ClipboardIcon } from "../components/icons";
import { useToast } from "../components/ToastContext";
import { useAuth } from "../auth/AuthContext";

const EMPTY = {
  claimNumber: "",
  policyId: "",
  amountClaimed: "",
  dateOfClaim: "",
  description: "",
  status: "Pending",
  imageName: "",
  imageMimeType: "",
  imageData: "",
  insuranceCompany: "B",
  costOfVehicle: "",
  minCoverage: "",
  maxCoverage: "",
};
const COLUMNS = 7;
const COMPANIES = ["A", "AA", "AC", "B", "BB", "BC", "BQ", "C", "DA", "O", "RE"];

export default function ClaimsPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [claims, setClaims] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.listClaims(), api.listPolicies()])
      .then(([c, p]) => { setClaims(c); setPolicies(p); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const policyNumber = (id) => policies.find((p) => p.id === id)?.policyNumber || "—";

  const remainingFor = (policyId, excludeClaimId = null) => {
    const policy = policies.find((p) => p.id === policyId);
    if (!policy) return null;
    const used = claims
      .filter((c) => c.policyId === policyId && c.status !== "Rejected" && c.id !== excludeClaimId)
      .reduce((sum, c) => sum + c.amountClaimed, 0);
    return policy.coverageAmount - used;
  };

  const openCreate = () => {
    setForm({ ...EMPTY, policyId: policies[0]?.id || "" });
    setEditingId(null);
    setFormError(null);
    setImagePreview("");
    setModalMode("create");
  };

  const openEdit = (c) => {
    setForm(c);
    setEditingId(c.id);
    setFormError(null);
    setImagePreview(c.imageData ? `data:${c.imageMimeType};base64,${c.imageData}` : "");
    setModalMode("edit");
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      if (modalMode === "create") {
        const payload = {
          ...form,
          amountClaimed: Number(form.amountClaimed),
          dateOfClaim: form.dateOfClaim || new Date().toISOString(),
          costOfVehicle: form.costOfVehicle ? Number(form.costOfVehicle) : undefined,
          minCoverage: form.minCoverage ? Number(form.minCoverage) : undefined,
          maxCoverage: form.maxCoverage ? Number(form.maxCoverage) : undefined,
        };
        await api.createClaim(payload);
        toast.success("Claim filed.");
      } else {
        // Admin review only ever changes the status (approve/reject) - the
        // rest of the claim's data is read-only at this point.
        await api.updateClaim(editingId, { status: form.status });
        toast.success(`Claim marked ${form.status}.`);
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
      await api.deleteClaim(id);
      toast.success("Claim deleted.");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onImageChange = (file) => {
    if (!file) {
      setForm({ ...form, imageName: "", imageMimeType: "", imageData: "" });
      setImagePreview("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      setForm({
        ...form,
        imageName: file.name,
        imageMimeType: file.type,
        imageData: base64,
      });
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const remaining = form.policyId ? remainingFor(form.policyId, editingId) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Claims</h1>
          <p>Claims filed against active policies, tracked from submission to payout.</p>
        </div>
        {!isAdmin && (
          <button className="btn btn-primary" onClick={openCreate} disabled={policies.length === 0}>+ New Claim</button>
        )}
      </div>

      {!isAdmin && policies.length === 0 && !loading && (
        <div className="alert alert-info">Create a policy first before filing a claim.</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Claim #</th><th>Policy</th><th>Amount</th><th>Date</th><th>Image</th><th>Status</th>{isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows columns={COLUMNS} />
              ) : (
                claims.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-mono">{c.claimNumber}</td>
                    <td className="cell-mono cell-muted">{policyNumber(c.policyId)}</td>
                    <td className="cell-mono">₹{c.amountClaimed.toLocaleString("en-IN")}</td>
                    <td className="cell-mono cell-muted">{c.dateOfClaim.slice(0, 10)}</td>
                    <td className="cell-mono cell-muted">
                      {c.imageName ? <span>{c.imageName}</span> : <span className="cell-muted">No image</span>}
                    </td>
                    <td><Badge status={c.status} /></td>
                    {isAdmin && (
                      <td className="cell-actions">
                        <Link className="btn btn-secondary btn-sm" to={`/predict-claim?claimId=${c.id}`}>Predict</Link>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Review</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setPendingDelete(c)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && claims.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><ClipboardIcon width={20} height={20} /></div>
            <h3>No claims filed yet</h3>
            <p>Claims filed against a policy will show up here.</p>
            {!isAdmin && policies.length > 0 && (
              <button className="btn btn-primary" onClick={openCreate}>+ New Claim</button>
            )}
          </div>
        )}
      </div>

      {modalMode === "create" && (
        <Modal title="New Claim" onClose={() => setModalMode(null)}>
          <form onSubmit={submit}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-grid">
              <div className="form-field">
                <label>Claim Number</label>
                <input required value={form.claimNumber} onChange={(e) => setForm({ ...form, claimNumber: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Policy</label>
                <select required value={form.policyId} onChange={(e) => setForm({ ...form, policyId: e.target.value })}>
                  {policies.map((p) => <option key={p.id} value={p.id}>{p.policyNumber} ({p.status})</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Amount Claimed (₹)</label>
                <input required type="number" min="1" value={form.amountClaimed} onChange={(e) => setForm({ ...form, amountClaimed: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Date of Claim</label>
                <input
                  required
                  type="date"
                  value={form.dateOfClaim}
                  onChange={(e) => setForm({ ...form, dateOfClaim: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Damage Image</label>
                <input
                  required
                  type="file"
                  accept="image/*"
                  onChange={(e) => onImageChange(e.target.files[0])}
                />
              </div>
              <div className="form-field">
                <label>Insurance Company</label>
                <select
                  value={form.insuranceCompany}
                  onChange={(e) => setForm({ ...form, insuranceCompany: e.target.value })}
                >
                  {COMPANIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Cost of Vehicle (₹)</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.costOfVehicle}
                  onChange={(e) => setForm({ ...form, costOfVehicle: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Min Coverage (₹)</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.minCoverage}
                  onChange={(e) => setForm({ ...form, minCoverage: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Max Coverage (₹)</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.maxCoverage}
                  onChange={(e) => setForm({ ...form, maxCoverage: e.target.value })}
                />
              </div>
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <textarea required rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
           
            {remaining !== null && (
              <p className="muted">Remaining coverage on this policy: ₹{remaining.toLocaleString("en-IN")}</p>
            )}
            {imagePreview && (
              <div className="preview-box">
                <label>Image preview</label>
                <img src={imagePreview} alt="Claim evidence" style={{ maxWidth: "100%", borderRadius: 6 }} />
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Submit Claim</button>
            </div>
          </form>
        </Modal>
      )}

      {modalMode === "edit" && (
        <Modal title="Review Claim" onClose={() => setModalMode(null)}>
          <form onSubmit={submit}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-grid">
              <div className="form-field">
                <label>Claim Number</label>
                <p className="cell-mono">{form.claimNumber}</p>
              </div>
              <div className="form-field">
                <label>Policy</label>
                <p className="cell-mono cell-muted">{policyNumber(form.policyId)}</p>
              </div>
              <div className="form-field">
                <label>Amount Claimed (₹)</label>
                <p className="cell-mono">₹{Number(form.amountClaimed).toLocaleString("en-IN")}</p>
              </div>
              <div className="form-field">
                <label>Date of Claim</label>
                <p className="cell-mono cell-muted">{form.dateOfClaim ? form.dateOfClaim.slice(0, 10) : "—"}</p>
              </div>
              <div className="form-field">
                <label>Damage Image</label>
                {imagePreview ? (
                  <img src={imagePreview} alt="Claim evidence" style={{ maxWidth: "100%", borderRadius: 6 }} />
                ) : (
                  <p className="cell-muted">No image attached</p>
                )}
              </div>
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <p className="cell-muted">{form.description}</p>
              </div>
              <div className="form-field">
                <label>Decision</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {["Pending", "Approved", "Rejected"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Decision</button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete claim?"
          message={`This will permanently remove claim ${pendingDelete.claimNumber}. This can't be undone.`}
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
