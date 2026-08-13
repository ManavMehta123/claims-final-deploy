import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/api";
import { ClipboardIcon } from "../components/icons";

const EMPTY = {
  Insurance_company: "B",
  Cost_of_vehicle: "",
  Min_coverage: "",
  Max_coverage: "",
  Expiry_date: "",
  description: "",
  imageName: "",
  imageMimeType: "",
  imageData: "",
};

const COMPANIES = ["A", "AA", "AC", "B", "BB", "BC", "BQ", "C", "DA", "O", "RE"];

export default function PredictClaimPage() {
  const [searchParams] = useSearchParams();
  const claimId = searchParams.get("claimId");
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(!!claimId);
  const [prefillError, setPrefillError] = useState(null);
  const [sourceClaim, setSourceClaim] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // When opened from a specific claim (Claims > Predict), pull that claim's
  // own data — and its policy's expiry date — instead of making the admin
  // retype what the policyholder already submitted.
  useEffect(() => {
    if (!claimId) return;
    setPrefillLoading(true);
    setPrefillError(null);
    Promise.all([api.getClaim(claimId), api.listPolicies()])
      .then(([claim, policies]) => {
        setSourceClaim(claim);
        const policy = policies.find((p) => p.id === claim.policyId);
        setForm({
          Insurance_company: claim.insuranceCompany || "B",
          Cost_of_vehicle: claim.costOfVehicle ?? "",
          Min_coverage: claim.minCoverage ?? "",
          Max_coverage: claim.maxCoverage ?? (policy ? policy.coverageAmount : ""),
          Expiry_date: policy ? policy.endDate.slice(0, 10) : "",
          description: claim.description || "",
          imageName: claim.imageName || "",
          imageMimeType: claim.imageMimeType || "",
          imageData: claim.imageData || "",
        });
      })
      .catch((err) => setPrefillError(err.message))
      .finally(() => setPrefillLoading(false));
  }, [claimId]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const payload = {
        ...form,
        Cost_of_vehicle: Number(form.Cost_of_vehicle),
        Min_coverage: Number(form.Min_coverage),
        Max_coverage: Number(form.Max_coverage),
      };
      const prediction = await api.predictClaimLLM(payload);
      setResult(prediction);
    } catch (err) {
      setError(err.details ? err.details.join(" | ") : err.message);
    } finally {
      setLoading(false);
    }
  };

  const onImageChange = (file) => {
    if (!file) {
      setForm({ ...form, imageName: "", imageMimeType: "", imageData: "" });
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
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Predict Claim</h1>
        </div>
      </div>

      {claimId && sourceClaim && (
        <div className="alert alert-info">
          Pre-filled from claim <strong>{sourceClaim.claimNumber}</strong>. Review before predicting — you can still edit any field below.
        </div>
      )}
      {prefillError && (
        <div className="alert alert-error">Couldn't load claim {claimId}: {prefillError}</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ padding: 24, maxWidth: 640, opacity: prefillLoading ? 0.6 : 1 }}>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Insurance Company</label>
              <select
                value={form.Insurance_company}
                onChange={(e) => setForm({ ...form, Insurance_company: e.target.value })}
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
                value={form.Cost_of_vehicle}
                onChange={(e) => setForm({ ...form, Cost_of_vehicle: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Min Coverage (₹)</label>
              <input
                required
                type="number"
                min="0"
                value={form.Min_coverage}
                onChange={(e) => setForm({ ...form, Min_coverage: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Max Coverage (₹)</label>
              <input
                required
                type="number"
                min="0"
                value={form.Max_coverage}
                onChange={(e) => setForm({ ...form, Max_coverage: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Policy Expiry Date</label>
              <input
                required
                type="date"
                value={form.Expiry_date}
                onChange={(e) => setForm({ ...form, Expiry_date: e.target.value })}
              />
            </div>
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Damage Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onImageChange(e.target.files[0])}
              />
            </div>
          </div>
          {form.imageName && (
            <div style={{ marginTop: 16 }}>
              <strong>Image attached:</strong> {form.imageName}
            </div>
          )}
          {form.imageData && (
            <div className="preview-box" style={{ marginTop: 12 }}>
              <img
                src={`data:${form.imageMimeType};base64,${form.imageData}`}
                alt="Damage evidence"
                style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6 }}
              />
            </div>
          )}
          <div className="modal-actions" style={{ justifyContent: "flex-start", paddingTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Predicting…" : "Predict"}
            </button>
          </div>
        </form>
      </div>

      {result && (
        <div className="card" style={{ padding: 24, maxWidth: 640, marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <ClipboardIcon width={20} height={20} />
            <h3 style={{ margin: 0 }}>Prediction Result</h3>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Decision</label>
              <div className="cell-mono" style={{ fontSize: 16 }}>
                {result.decision ?? "Unknown"}
                {typeof result.claim_probability === "number"
                  ? ` (${(result.claim_probability * 100).toFixed(1)}% probability)`
                  : ""}
              </div>
            </div>
            <div className="form-field">
              <label>Estimated Claim Amount</label>
              <div className="cell-mono" style={{ fontSize: 16 }}>
                ₹{Number(result.amount ?? 0).toLocaleString("en-IN")}
              </div>
            </div>
            {result.reason && (
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Reason</label>
                <div className="cell-mono" style={{ fontSize: 14 }}>{result.reason}</div>
              </div>
            )}
          </div>
          <p style={{ color: "var(--muted, #888)", fontSize: 13, marginTop: 8 }}>
            This is a model estimate, not a guaranteed payout. Final claim amounts are subject to review.
          </p>
        </div>
      )}
    </div>
  );
}
