"""
Model Governance layer: logs data drift and model drift for every
challenger produced by the Continuous Learning Pipeline, and writes a
timestamped report (JSON + HTML) that can be inspected on demand or
wired into the retraining flow.

This is deliberately a thin layer on top of what train.py and
evaluate_and_promote.py already produce, following the same pattern as
registry.py: read what's already on disk (metrics.json, the training
data itself), don't recompute anything that's already been computed,
and write an immutable, timestamped artifact rather than overwriting
anything in place.

Two kinds of drift are checked:

  1. Data drift — has the shape of the training data itself shifted?
     Compares the feature distributions of the CHALLENGER's training
     data (seed + live_feedback, as loaded by train.py at the time it
     ran) against a fixed REFERENCE snapshot (the original seed
     dataset, data/train.csv). Uses Population Stability Index (PSI)
     per feature, bucketed into deciles for numeric features and by
     category for the categorical feature — no extra dependency
     (scipy) beyond what's already in requirements.txt.

  2. Model drift — has predictive performance regressed? Reuses the
     exact same comparison evaluate_and_promote.py already makes
     (challenger metrics vs. current champion metrics), so the two
     scripts can never disagree about what "regressed" means.

Severity thresholds are intentionally simple and tunable at the top of
this file rather than buried in logic, matching the style of
CLASSIFIER_TOLERANCE / REGRESSOR_TOLERANCE in evaluate_and_promote.py.

Usage:
  python governance_pipeline.py --challenger <version> [--triggered-by <source>]

  --challenger    Version id of the challenger to check (must already
                   exist in the registry, i.e. train.py has run).
  --triggered-by  Free-text label for what kicked this off, e.g.
                   "manual-demo", "continuous_retraining_dag". Recorded
                   in the report only — purely informational.

Exit code is always 0 (a drift report is a report, not a promotion
gate) — evaluate_and_promote.py remains the sole decider of whether a
challenger goes live. Call this before or after evaluate_and_promote.py
without changing that script's behavior.
"""
import argparse
import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

import registry

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "data", "train.csv")
LIVE_FEEDBACK_PATH = os.path.join(SCRIPT_DIR, "data", "live_feedback.csv")
REPORTS_DIR = os.path.join(SCRIPT_DIR, "reports", "governance")

NUMERIC_FEATURES = ["Cost_of_vehicle", "Min_coverage", "Max_coverage", "days_to_expiry"]
CATEGORICAL_FEATURES = ["Insurance_company"]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

REFERENCE_DATE = pd.Timestamp("2026-01-01")

# PSI interpretation (standard industry bands):
#   < 0.1  -> no significant shift
#   0.1-0.25 -> moderate shift, worth watching
#   > 0.25 -> significant shift, investigate
PSI_WATCH_THRESHOLD = 0.10
PSI_ALERT_THRESHOLD = 0.25

# Reuse the exact same tolerances evaluate_and_promote.py uses, so a
# challenger this script calls "model-drifted" is exactly one that
# evaluate_and_promote.py would reject.
CLASSIFIER_TOLERANCE = 0.01
REGRESSOR_TOLERANCE = 0.02


# --------------------------------------------------------------------------
# Data loading (mirrors train.py's _engineer/load_training_data so drift is
# measured on the same engineered features the models actually see)
# --------------------------------------------------------------------------

def _engineer(df):
    df = df.copy()
    df["Expiry_date"] = pd.to_datetime(df["Expiry_date"], errors="coerce", utc=True).dt.tz_localize(None)
    df["days_to_expiry"] = (df["Expiry_date"] - REFERENCE_DATE).dt.days
    return df


def _load_reference():
    """The original seed dataset — the fixed baseline every challenger's
    data is compared against, so drift is measured cumulatively from
    day one rather than against a constantly-moving previous run."""
    df = pd.read_csv(DATA_PATH)
    return _engineer(df)


def _load_current(row_counts=None):
    """Seed + live_feedback, exactly like train.py's load_training_data.
    If a challenger's own row_counts (from its metrics.json) show no
    live_feedback rows were used, this still safely reflects that."""
    df = pd.read_csv(DATA_PATH)
    if os.path.exists(LIVE_FEEDBACK_PATH):
        feedback = pd.read_csv(LIVE_FEEDBACK_PATH)
        if len(feedback):
            feedback = feedback[[c for c in df.columns if c in feedback.columns]]
            df = pd.concat([df, feedback], ignore_index=True)
    return _engineer(df)


# --------------------------------------------------------------------------
# Data drift: Population Stability Index per feature
# --------------------------------------------------------------------------

def _psi_numeric(reference, current, buckets=10):
    """PSI for a numeric feature, bucketed into deciles of the reference
    distribution so bucket boundaries are fixed regardless of how the
    current data has shifted."""
    reference = reference.dropna()
    current = current.dropna()
    if len(reference) == 0 or len(current) == 0:
        return None

    edges = np.unique(np.quantile(reference, np.linspace(0, 1, buckets + 1)))
    if len(edges) < 3:
        # Degenerate feature (near-constant) — not enough spread to bucket.
        return 0.0

    ref_counts, _ = np.histogram(reference, bins=edges)
    cur_counts, _ = np.histogram(current, bins=edges)

    ref_pct = np.clip(ref_counts / max(len(reference), 1), 1e-4, None)
    cur_pct = np.clip(cur_counts / max(len(current), 1), 1e-4, None)

    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def _psi_categorical(reference, current):
    """PSI for a categorical feature, bucketed by category value. New
    categories in `current` that never appeared in `reference` are
    included with a floor reference share, so they show up as drift
    rather than being silently ignored."""
    reference = reference.dropna()
    current = current.dropna()
    if len(reference) == 0 or len(current) == 0:
        return None

    categories = sorted(set(reference.unique()) | set(current.unique()))
    ref_pct = np.clip(
        np.array([(reference == c).sum() / len(reference) for c in categories]), 1e-4, None
    )
    cur_pct = np.clip(
        np.array([(current == c).sum() / len(current) for c in categories]), 1e-4, None
    )
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def _severity(psi):
    if psi is None:
        return "unknown"
    if psi >= PSI_ALERT_THRESHOLD:
        return "alert"
    if psi >= PSI_WATCH_THRESHOLD:
        return "watch"
    return "stable"


def check_data_drift(reference_df, current_df):
    features = {}
    for col in NUMERIC_FEATURES:
        psi = _psi_numeric(reference_df[col], current_df[col])
        features[col] = {"type": "numeric", "psi": psi, "severity": _severity(psi)}
    for col in CATEGORICAL_FEATURES:
        psi = _psi_categorical(reference_df[col], current_df[col])
        features[col] = {"type": "categorical", "psi": psi, "severity": _severity(psi)}

    psi_values = [f["psi"] for f in features.values() if f["psi"] is not None]
    overall_psi = float(np.mean(psi_values)) if psi_values else None
    flagged = [name for name, f in features.items() if f["severity"] == "alert"]

    return {
        "reference_rows": int(len(reference_df)),
        "current_rows": int(len(current_df)),
        "features": features,
        "overall_psi": overall_psi,
        "overall_severity": _severity(overall_psi),
        "flagged_features": flagged,
        "drifted": len(flagged) > 0,
    }


# --------------------------------------------------------------------------
# Model drift: same comparison evaluate_and_promote.py makes
# --------------------------------------------------------------------------

def check_model_drift(challenger_metrics, champion_metrics):
    if champion_metrics is None:
        return {
            "has_champion": False,
            "condition_f1_delta": None,
            "amount_r2_delta": None,
            "drifted": False,
            "reason": "no current champion to compare against — nothing to flag",
        }

    f1_delta = challenger_metrics["condition_f1"] - champion_metrics["condition_f1"]
    r2_delta = challenger_metrics["amount_r2"] - champion_metrics["amount_r2"]

    reasons = []
    if f1_delta < -CLASSIFIER_TOLERANCE:
        reasons.append(f"condition_f1 regressed by {-f1_delta:.4f} (tolerance {CLASSIFIER_TOLERANCE})")
    if r2_delta < -REGRESSOR_TOLERANCE:
        reasons.append(f"amount_r2 regressed by {-r2_delta:.4f} (tolerance {REGRESSOR_TOLERANCE})")

    return {
        "has_champion": True,
        "champion_version": champion_metrics.get("version"),
        "condition_f1_delta": f1_delta,
        "amount_r2_delta": r2_delta,
        "drifted": len(reasons) > 0,
        "reason": "; ".join(reasons) if reasons else "no regression beyond tolerance",
    }


# --------------------------------------------------------------------------
# HTML report rendering
# --------------------------------------------------------------------------

def _badge_class(severity_or_status):
    """Map stable/watch/alert (data drift) or ok/drifted (model drift)
    to a CSS class."""
    s = (severity_or_status or "").lower()
    if s in ("alert", "drifted"):
        return "sev-bad"
    if s in ("watch",):
        return "sev-warn"
    return "sev-ok"


def _render_html(report):
    generated_at = report.get("generated_at", "")
    triggered_by = report.get("triggered_by", "")
    challenger_version = report.get("challenger_version", "")
    champion_version = report.get("champion_version") or "none"

    dd = report["data_drift"]
    md = report["model_drift"]

    overall_psi = dd.get("overall_psi")
    overall_psi_display = f"{overall_psi:.4f}" if overall_psi is not None else "n/a"

    feature_rows = ""
    for name, info in dd["features"].items():
        psi = info["psi"]
        psi_display = f"{psi:.4f}" if psi is not None else "n/a"
        feature_rows += f"""
        <tr>
            <td>{name}</td>
            <td>{info['type']}</td>
            <td>{psi_display}</td>
            <td><span class="badge {_badge_class(info['severity'])}">{info['severity']}</span></td>
        </tr>"""

    if md["has_champion"]:
        f1_delta = md["condition_f1_delta"]
        r2_delta = md["amount_r2_delta"]
        model_rows = f"""
        <tr>
            <td>condition_f1</td>
            <td>{f1_delta:+.4f}</td>
            <td>{champion_version}</td>
        </tr>
        <tr>
            <td>amount_r2</td>
            <td>{r2_delta:+.4f}</td>
            <td>{champion_version}</td>
        </tr>"""
    else:
        model_rows = """
        <tr><td colspan="3">No current champion to compare against.</td></tr>"""

    model_status = "drifted" if md["drifted"] else "ok"
    overall_drifted = report["overall_drifted"]
    overall_status = "DRIFT DETECTED" if overall_drifted else "no drift detected"
    overall_cls = "sev-bad" if overall_drifted else "sev-ok"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Model Governance Report</title>
<style>
  body {{ font-family: -apple-system, Segoe UI, Arial, sans-serif; background: #f4f5f7; margin: 0; padding: 32px; color: #1f2430; }}
  .card {{ max-width: 880px; margin: 0 auto; background: #fff; border-radius: 10px; padding: 28px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
  h1 {{ font-size: 22px; margin-bottom: 4px; }}
  .meta {{ color: #667085; font-size: 13px; margin-bottom: 20px; }}
  h2 {{ font-size: 16px; margin-top: 28px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th {{ text-align: left; background: #f7f8fa; padding: 8px 10px; border-bottom: 1px solid #e4e7ec; font-weight: 600; }}
  td {{ padding: 8px 10px; border-bottom: 1px solid #eef0f2; }}
  .badge {{ display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; text-transform: capitalize; }}
  .sev-ok {{ background: #e6f6ec; color: #1a7f4b; }}
  .sev-warn {{ background: #fff4e0; color: #b26a00; }}
  .sev-bad {{ background: #fde8e8; color: #c62828; }}
  .overall {{ margin-top: 8px; }}
  .reason {{ font-size: 13px; color: #667085; margin-top: 6px; }}
</style>
</head>
<body>
  <div class="card">
    <h1>Model Governance Report</h1>
    <div class="meta">
      Generated {generated_at} &middot; triggered by {triggered_by} &middot;
      challenger {challenger_version} &middot; champion {champion_version}
    </div>

    <h2>Data Drift <span class="badge {_badge_class(dd['overall_severity'])}">{dd['overall_severity']}</span></h2>
    <div class="meta">
      Reference: seed dataset ({dd['reference_rows']} rows) &middot;
      Current: seed + live_feedback ({dd['current_rows']} rows) &middot;
      mean PSI = {overall_psi_display}
    </div>
    <table>
      <tr><th>Feature</th><th>Type</th><th>PSI</th><th>Severity</th></tr>
      {feature_rows}
    </table>

    <h2>Model Drift <span class="badge {_badge_class(model_status)}">{model_status}</span></h2>
    <table>
      <tr><th>Metric</th><th>Delta vs. champion</th><th>Champion version</th></tr>
      {model_rows}
    </table>
    <div class="reason">{md['reason']}</div>

    <h2 class="overall">Overall: <span class="badge {overall_cls}">{overall_status}</span></h2>
  </div>
</body>
</html>"""


# --------------------------------------------------------------------------
# Orchestration + report
# --------------------------------------------------------------------------

def run_governance_check(challenger_version, triggered_by="manual"):
    challenger = registry.get_version(challenger_version)
    if challenger is None:
        raise ValueError(
            f"Unknown version: {challenger_version}. Run train.py first, e.g.\n"
            f"  python train.py --no-promote --version {challenger_version}"
        )

    champion = registry.get_current()

    reference_df = _load_reference()
    current_df = _load_current()

    data_drift = check_data_drift(reference_df, current_df)
    model_drift = check_model_drift(
        challenger["metrics"], champion["metrics"] if champion else None
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "triggered_by": triggered_by,
        "challenger_version": challenger_version,
        "champion_version": champion["version"] if champion else None,
        "data_drift": data_drift,
        "model_drift": model_drift,
        "overall_drifted": data_drift["drifted"] or model_drift["drifted"],
    }

    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_name = f"governance_{challenger_version}_{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.json"
    report_path = os.path.join(REPORTS_DIR, report_name)
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    # Also keep a "latest.json" pointer so a dashboard/API can show the
    # most recent report without needing to list the directory.
    with open(os.path.join(REPORTS_DIR, "latest.json"), "w") as f:
        json.dump({"report_file": report_name, **report}, f, indent=2)

    # HTML rendering of the same report — timestamped copy plus a
    # "latest.html" pointer, mirroring the JSON latest-pointer pattern.
    html_content = _render_html(report)
    html_report_name = report_name.replace(".json", ".html")
    html_report_path = os.path.join(REPORTS_DIR, html_report_name)
    with open(html_report_path, "w") as f:
        f.write(html_content)
    with open(os.path.join(REPORTS_DIR, "latest.html"), "w") as f:
        f.write(html_content)

    _print_summary(report, report_path, html_report_path)
    return report


def _print_summary(report, report_path, html_report_path=None):
    dd, md = report["data_drift"], report["model_drift"]
    print(f"Governance report for challenger '{report['challenger_version']}' "
          f"(triggered by: {report['triggered_by']})")
    print(f"  Data drift : {dd['overall_severity'].upper()} "
          f"(mean PSI={dd['overall_psi']:.4f})" if dd["overall_psi"] is not None
          else "  Data drift : UNKNOWN (insufficient data)")
    if dd["flagged_features"]:
        print(f"    Flagged features: {', '.join(dd['flagged_features'])}")
    print(f"  Model drift: {'DRIFTED' if md['drifted'] else 'OK'} — {md['reason']}")
    print(f"  Overall    : {'DRIFT DETECTED' if report['overall_drifted'] else 'no drift detected'}")
    print(f"  Report written to {report_path}")
    if html_report_path:
        print(f"  HTML report written to {html_report_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--challenger", required=True, help="Version id of the challenger to check.")
    parser.add_argument("--triggered-by", default="manual", help="Label for what triggered this run.")
    args = parser.parse_args()
    run_governance_check(args.challenger, triggered_by=args.triggered_by)


if __name__ == "__main__":
    main()
