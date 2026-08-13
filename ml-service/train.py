"""
Train the claim prediction models:
  1. Classifier: does this policy result in a claim? (Condition: 0/1)
  2. Regressor: if a claim occurs, what is the claim Amount?

Features used (tabular only): Insurance_company, Cost_of_vehicle,
Min_coverage, Max_coverage, and a derived "days_to_expiry" feature
from Expiry_date. Image_path is not used.

Continuous Learning Pipeline
-----------------------------
Training data is the original seed dataset (data/train.csv) UNION any
rows ingested from real, decided claims (data/live_feedback.csv), which
ml-service/ingestion/ingest.py appends to on a schedule. Every run writes
a brand-new, immutable version under artifacts/versions/<version>/ via
registry.py instead of overwriting the live model in place -- see
registry.py's module docstring for the full versioning/rollback story.

Usage:
  python train.py                 # manual run: trains AND promotes
                                   # the result to "current" immediately
  python train.py --no-promote    # trains a challenger only (this is
                                   # what the Airflow retraining DAG uses;
                                   # evaluate_and_promote.py decides
                                   # whether it actually goes live)
"""
import argparse
import json
import os
from datetime import datetime
from pathlib import Path        
import joblib
import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score, f1_score, mean_absolute_error, mean_squared_error, r2_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import registry

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "data", "train.csv")
LIVE_FEEDBACK_PATH = os.path.join(SCRIPT_DIR, "data", "live_feedback.csv")
ARTIFACT_DIR = registry.ARTIFACT_DIR
os.makedirs(ARTIFACT_DIR, exist_ok=True)

mlflow.set_tracking_uri(f"sqlite:///{Path(ARTIFACT_DIR, 'mlflow.db').as_posix()}")
mlflow.set_experiment("claim-prediction")

NUMERIC_FEATURES = ["Cost_of_vehicle", "Min_coverage", "Max_coverage", "days_to_expiry"]
CATEGORICAL_FEATURES = ["Insurance_company"]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

REFERENCE_DATE = pd.Timestamp("2026-01-01")


def _engineer(df):
    df = df.copy()
    df["Expiry_date"] = pd.to_datetime(df["Expiry_date"], errors="coerce", utc=True).dt.tz_localize(None)
    df["days_to_expiry"] = (df["Expiry_date"] - REFERENCE_DATE).dt.days
    return df


def load_training_data():
    """Seed dataset + any live-feedback rows ingested from real, decided
    claims (see ingestion/ingest.py). Falling back to seed-only when no
    feedback has been ingested yet keeps `python train.py` runnable on a
    freshly-cloned repo."""
    df = pd.read_csv(DATA_PATH)
    df["source"] = "seed"
    row_counts = {"seed": len(df)}

    if os.path.exists(LIVE_FEEDBACK_PATH):
        feedback = pd.read_csv(LIVE_FEEDBACK_PATH)
        if len(feedback):
            feedback = feedback[[c for c in df.columns if c != "source" and c in feedback.columns]]
            feedback["source"] = "live_feedback"
            df = pd.concat([df, feedback], ignore_index=True)
        row_counts["live_feedback"] = len(feedback)

    return _engineer(df), row_counts


def build_preprocessor():
    numeric_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    categorical_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    return ColumnTransformer([
        ("num", numeric_pipe, NUMERIC_FEATURES),
        ("cat", categorical_pipe, CATEGORICAL_FEATURES),
    ])


def train(promote=True, version=None):
    """Train a fresh classifier+regressor pair, write it to a new
    registry version, and return (version_id, metrics_dict).

    promote=True (the default for a manual run) makes the new version the
    one app.py serves immediately. The Airflow retraining DAG instead
    calls train(promote=False) and hands the resulting version to
    evaluate_and_promote.py, which only promotes it if it's at least as
    good as the current champion.
    """
    df, row_counts = load_training_data()

    # Drop the sentinel/corrupt Amount row(s) (-999) — same data-quality
    # fix as the original EDA found in the seed dataset.
    df_clean = df[~(df.Amount < 0)].copy()

    X = df_clean[ALL_FEATURES]
    y_condition = df_clean["Condition"]

    X_train, X_test, yc_train, yc_test = train_test_split(
        X, y_condition, test_size=0.2, random_state=42, stratify=y_condition
    )

    version, version_path = registry.new_version_dir(version)

    with mlflow.start_run(run_name=f"claim-models-{version}"):
        # ---- Stage 1: Condition classifier ----
        clf_pipe = Pipeline([
            ("preprocess", build_preprocessor()),
            ("model", RandomForestClassifier(
                n_estimators=300, max_depth=8, random_state=42, class_weight="balanced"
            )),
        ])
        clf_pipe.fit(X_train, yc_train)
        yc_pred = clf_pipe.predict(X_test)
        acc = accuracy_score(yc_test, yc_pred)
        f1 = f1_score(yc_test, yc_pred)
        mlflow.log_metric("condition_accuracy", acc)
        mlflow.log_metric("condition_f1", f1)
        print(f"Condition classifier -> accuracy={acc:.3f} f1={f1:.3f}")

        # ---- Stage 2: Amount regressor (trained only on rows with a claim) ----
        claim_rows = df_clean[(df_clean.Condition == 1) & df_clean.Amount.notnull()]
        Xr = claim_rows[ALL_FEATURES]
        yr = claim_rows["Amount"]
        Xr_train, Xr_test, yr_train, yr_test = train_test_split(
            Xr, yr, test_size=0.2, random_state=42
        )
        reg_pipe = Pipeline([
            ("preprocess", build_preprocessor()),
            ("model", RandomForestRegressor(
                n_estimators=400, max_depth=10, random_state=42
            )),
        ])
        reg_pipe.fit(Xr_train, yr_train)
        yr_pred = reg_pipe.predict(Xr_test)
        mae = mean_absolute_error(yr_test, yr_pred)
        rmse = mean_squared_error(yr_test, yr_pred) ** 0.5
        r2 = r2_score(yr_test, yr_pred)
        mlflow.log_metric("amount_mae", mae)
        mlflow.log_metric("amount_rmse", rmse)
        mlflow.log_metric("amount_r2", r2)
        print(f"Amount regressor -> MAE={mae:.1f} RMSE={rmse:.1f} R2={r2:.3f}")

        mlflow.log_params({
            "clf_n_estimators": 300, "clf_max_depth": 8,
            "reg_n_estimators": 400, "reg_max_depth": 10,
            "features": ",".join(ALL_FEATURES),
            "version": version,
            **{f"rows_{k}": v for k, v in row_counts.items()},
        })

        # ---- Serialize into this run's own version folder ----
        joblib.dump(clf_pipe, os.path.join(version_path, "condition_classifier.joblib"))
        joblib.dump(reg_pipe, os.path.join(version_path, "amount_regressor.joblib"))
        mlflow.log_artifact(os.path.join(version_path, "condition_classifier.joblib"))
        mlflow.log_artifact(os.path.join(version_path, "amount_regressor.joblib"))

        metrics = {
            "condition_accuracy": acc, "condition_f1": f1,
            "amount_mae": mae, "amount_rmse": rmse, "amount_r2": r2,
            "trained_at": datetime.now().isoformat(),
            "features": ALL_FEATURES,
            "row_counts": row_counts,
            "version": version,
        }
        with open(os.path.join(version_path, "metrics.json"), "w") as f:
            json.dump(metrics, f, indent=2)

        registry.register_version(
            version, version_path, metrics, trained_from=row_counts, promote=promote
        )
        print(f"Version {version} saved to {version_path}" + (" and PROMOTED to current." if promote else " (challenger, not yet promoted)."))

    return version, metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-promote", action="store_true",
        help="Train a challenger version without making it the serving model.",
    )
    parser.add_argument("--version", default=None, help="Explicit version id (default: timestamp-based).")
    args = parser.parse_args()
    train(promote=not args.no_promote, version=args.version)


if __name__ == "__main__":
    main()
