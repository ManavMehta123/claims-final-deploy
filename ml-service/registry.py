"""
Model registry for the Continuous Learning Pipeline.

Every training run (manual or Airflow-triggered) writes its artifacts to
its own immutable version folder under ARTIFACT_DIR/versions/<version>/
rather than overwriting the live model in place. A single small JSON file,
registry.json, tracks every version that has ever been trained and which
one is currently "current" (i.e. the one app.py serves).

This gives the pipeline two things the story asks for directly:
  - Model versioning: nothing trained is ever deleted or silently
    overwritten; every run is inspectable after the fact.
  - Rollback capability: switching "current" back to an older version is
    a metadata update (registry.json), not a retrain — see rollback().

Layout on disk:
  artifacts/
    registry.json                  <- source of truth for this module
    versions/
      v1_20260807-120000/
        condition_classifier.joblib
        amount_regressor.joblib
        metrics.json
      v2_20260814-030000/
        ...
    condition_classifier.joblib    <- copy of the CURRENT version, kept at
    amount_regressor.joblib           the top level so app.py's existing
    metrics.json                      joblib.load(...) paths keep working
                                       even for anyone not using the
                                       registry-aware loader.
"""
import json
import os
import shutil
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACT_DIR = os.environ.get("ARTIFACT_DIR", os.path.join(SCRIPT_DIR, "artifacts"))
VERSIONS_DIR = os.path.join(ARTIFACT_DIR, "versions")
REGISTRY_PATH = os.path.join(ARTIFACT_DIR, "registry.json")

MODEL_FILES = ["condition_classifier.joblib", "amount_regressor.joblib"]


def _now_version_id(prefix="v"):
    return f"{prefix}{datetime.now(timezone.utc):%Y%m%d-%H%M%S}"


def _empty_registry():
    return {"current": None, "versions": []}


def load_registry():
    if not os.path.exists(REGISTRY_PATH):
        return _empty_registry()
    with open(REGISTRY_PATH) as f:
        return json.load(f)


def _save_registry(registry):
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    tmp_path = REGISTRY_PATH + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(registry, f, indent=2)
    os.replace(tmp_path, REGISTRY_PATH)  # atomic on POSIX


def new_version_dir(version=None):
    """Reserve (create) a fresh version directory for a training run and
    return (version_id, path). Does not touch registry.json — call
    register_version() once the model files are actually written there."""
    version = version or _now_version_id()
    path = os.path.join(VERSIONS_DIR, version)
    os.makedirs(path, exist_ok=True)
    return version, path


def register_version(version, path, metrics, trained_from=None, promote=False):
    """Record a completed training run in registry.json. Set promote=True
    to also make it the serving ("current") version immediately -- used by
    a manual `python train.py` run. The retraining DAG instead trains with
    promote=False and lets evaluate_and_promote.py decide."""
    registry = load_registry()
    entry = {
        "version": version,
        "path": os.path.relpath(path, ARTIFACT_DIR),
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "trained_from": trained_from,  # e.g. row counts / data sources used
        "status": "challenger",
    }
    registry["versions"] = [v for v in registry["versions"] if v["version"] != version] + [entry]
    _save_registry(registry)
    if promote:
        promote_version(version)
    return entry


def get_version(version):
    registry = load_registry()
    for v in registry["versions"]:
        if v["version"] == version:
            return v
    return None


def get_current():
    registry = load_registry()
    if not registry["current"]:
        return None
    return get_version(registry["current"])


def list_versions():
    registry = load_registry()
    return sorted(registry["versions"], key=lambda v: v["trained_at"], reverse=True)


def promote_version(version):
    """Make `version` the live/serving model: mark it champion in the
    registry and copy its artifact files up to the top-level ARTIFACT_DIR
    so app.py's plain joblib.load(ARTIFACT_DIR/...) paths always resolve
    to whatever is current, without app.py needing to know about
    versioning at all."""
    entry = get_version(version)
    if entry is None:
        raise ValueError(f"Unknown model version: {version}")

    version_path = os.path.join(ARTIFACT_DIR, entry["path"])
    for fname in MODEL_FILES:
        src = os.path.join(version_path, fname)
        if not os.path.exists(src):
            raise FileNotFoundError(f"Version {version} is missing {fname} — cannot promote.")
        shutil.copy2(src, os.path.join(ARTIFACT_DIR, fname))

    metrics_src = os.path.join(version_path, "metrics.json")
    if os.path.exists(metrics_src):
        shutil.copy2(metrics_src, os.path.join(ARTIFACT_DIR, "metrics.json"))

    registry = load_registry()
    previous_current = registry["current"]
    for v in registry["versions"]:
        if v["version"] == version:
            v["status"] = "current"
        elif v["status"] == "current":
            v["status"] = "champion-history"
    registry["current"] = version
    _save_registry(registry)
    return {"promoted": version, "previous": previous_current}


# Rollback is intentionally just promote_version() under a name that says
# what the operator is doing — swap-and-copy is symmetric either direction,
# whether you're moving forward to a new challenger or back to an older,
# already-proven version.
def rollback_to(version):
    entry = get_version(version)
    if entry is None:
        raise ValueError(
            f"Unknown model version: {version}. Known versions: "
            + ", ".join(v["version"] for v in list_versions())
        )
    return promote_version(version)
