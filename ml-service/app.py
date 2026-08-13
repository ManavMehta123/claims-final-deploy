"""
Flask API for the Claim Prediction Model.

Endpoints:
  GET  /health                -> service liveness + model info
  POST /predict                -> predict Condition (claim likely?) and Amount

Expected JSON body for /predict:
{
  "Insurance_company": "B",
  "Cost_of_vehicle": 46500.0,
  "Min_coverage": 1150.0,
  "Max_coverage": 11800.0,
  "Expiry_date": "2027-03-15"
}
"""
import os
import json
import re
import base64
import binascii
from datetime import datetime

import joblib
import pandas as pd
from flask import Flask, request, jsonify
from dotenv import load_dotenv

import registry

try:
    import google.generativeai as genai
except ImportError:
    genai = None

# When running `python app.py` directly (outside Docker), pick up a local
# .env file next to this script so GEMINI_API_KEY doesn't have to be set
# manually in every new shell. In Docker, env vars come from docker-compose
# already, and this is a no-op if ml-service/.env doesn't exist.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

ARTIFACT_DIR = registry.ARTIFACT_DIR
REFERENCE_DATE = pd.Timestamp("2026-01-01")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
if GEMINI_API_KEY and genai:
    genai.configure(api_key=GEMINI_API_KEY)

app = Flask(__name__)

# clf_pipe / reg_pipe / metrics always reflect whatever registry.json's
# "current" pointer says, at the top-level ARTIFACT_DIR (see registry.py's
# promote_version, which copies the champion's files there). This module
# state is refreshed by load_active_models(), called at startup and again
# whenever POST /model/reload or /model/rollback change what's current —
# so a champion promoted by the Airflow retraining DAG goes live without
# a container restart.
clf_pipe = reg_pipe = None
metrics = {}


def load_active_models():
    global clf_pipe, reg_pipe, metrics
    clf_pipe = joblib.load(os.path.join(ARTIFACT_DIR, "condition_classifier.joblib"))
    reg_pipe = joblib.load(os.path.join(ARTIFACT_DIR, "amount_regressor.joblib"))
    metrics_path = os.path.join(ARTIFACT_DIR, "metrics.json")
    if os.path.exists(metrics_path):
        with open(metrics_path) as f:
            metrics = json.load(f)
    else:
        metrics = {}


load_active_models()

REQUIRED_FIELDS = [
    "Insurance_company", "Cost_of_vehicle", "Min_coverage",
    "Max_coverage", "Expiry_date",
]


def build_feature_row(payload):
    missing = [f for f in REQUIRED_FIELDS if f not in payload or payload[f] in (None, "")]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")

    expiry = pd.to_datetime(payload["Expiry_date"], errors="coerce", utc=True)
    if pd.isna(expiry):
        raise ValueError("Expiry_date could not be parsed. Use YYYY-MM-DD.")
    expiry = expiry.tz_localize(None)

    days_to_expiry = (expiry - REFERENCE_DATE).days

    row = pd.DataFrame([{
        "Cost_of_vehicle": float(payload["Cost_of_vehicle"]),
        "Min_coverage": float(payload["Min_coverage"]),
        "Max_coverage": float(payload["Max_coverage"]),
        "days_to_expiry": days_to_expiry,
        "Insurance_company": str(payload["Insurance_company"]),
    }])
    return row


def load_reference_examples():
    sample_path = os.path.join(os.path.dirname(__file__), "data", "train.csv")
    if not os.path.exists(sample_path):
        return []
    df = pd.read_csv(sample_path)
    df = df.head(6)
    examples = []
    for _, row in df.iterrows():
        examples.append(
            "- " + ", ".join(
                f"{field}: {row[field]}" for field in [
                    "Image_path",
                    "Insurance_company",
                    "Cost_of_vehicle",
                    "Min_coverage",
                    "Max_coverage",
                    "Expiry_date",
                    "Condition",
                    "Amount",
                ]
            )
        )
    return examples

REFERENCE_EXAMPLES = load_reference_examples()


def build_llm_prompt(payload):
    image_block = ""
    if payload.get("imageData") and payload.get("imageMimeType"):
        image_block = (
            "An image of the damage is attached separately as part of this "
            "request. Inspect it carefully as part of your evaluation.\n"
        )

    prompt = [
        "You are an insurance claims adjudication assistant. Use the historical examples below to help decide whether a new claim should be approved or rejected. If a claim looks exaggerated, inconsistent, or unsupported by the image evidence, mark it rejected. Otherwise, recommend the most plausible claim amount.",
        "Return a JSON object only with these keys: decision, claim_probability, amount, reason.",
        "decision should be either Approved or Rejected.",
        "claim_probability should be a number between 0 and 1.",
        "amount should be the estimated claim amount if approved, or 0 if rejected.",
        "reason should be one short sentence (under 20 words) explaining the decision.",
        "\nHistorical examples:\n" + "\n".join(REFERENCE_EXAMPLES),
        "\nNew claim details:\n"
        f"Insurance_company: {payload.get('Insurance_company')}\n"
        f"Cost_of_vehicle: {payload.get('Cost_of_vehicle')}\n"
        f"Min_coverage: {payload.get('Min_coverage')}\n"
        f"Max_coverage: {payload.get('Max_coverage')}\n"
        f"Expiry_date: {payload.get('Expiry_date')}\n"
        f"Description: {payload.get('description', 'No description provided.')}\n"
        f"Image_name: {payload.get('imageName', 'No image attached.')}\n"
        "\n"
        + image_block
    ]
    return "\n\n".join(prompt)


def extract_json_object(text, finish_reason=None):
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        preview = (text or "").strip()
        truncated_note = ""
        if finish_reason is not None and str(finish_reason) not in ("1", "STOP"):
            truncated_note = (
                f" The model stopped early (finish_reason={finish_reason}), "
                "which usually means it ran out of output tokens before "
                "finishing — try raising max_output_tokens."
            )
        raise ValueError(
            "The LLM response did not contain a recognizable JSON object."
            f"{truncated_note} Raw response was: {preview!r}"
        )
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Could not parse JSON from LLM response: {exc}")


@app.get("/health")
def health():
    current = registry.load_registry().get("current")
    return jsonify({
        "status": "ok",
        "model_metrics": metrics,
        "model_version": current,
        "time": datetime.utcnow().isoformat(),
    })


# --- Continuous Learning Pipeline: model versioning & rollback ----------
# See registry.py / rollback.py / docs/CONTINUOUS_LEARNING.md. These
# endpoints let an operator (or the Airflow DAG, for /reload) inspect and
# control which trained model version is actually serving traffic,
# without needing shell access to the container.

@app.get("/model/versions")
def model_versions():
    return jsonify({
        "current": registry.load_registry().get("current"),
        "versions": registry.list_versions(),
    })


@app.post("/model/rollback")
def model_rollback():
    payload = request.get_json(silent=True) or {}
    version = payload.get("version")
    if not version:
        return jsonify({"error": "InvalidInput", "message": "Body must include {\"version\": \"<version-id>\"}."}), 400
    try:
        result = registry.rollback_to(version)
    except ValueError as e:
        return jsonify({"error": "UnknownVersion", "message": str(e)}), 404
    load_active_models()
    return jsonify({**result, "model_metrics": metrics})


@app.post("/model/reload")
def model_reload():
    """Re-reads whatever registry.json currently marks as 'current' into
    memory. Called by the retraining DAG right after a successful
    promotion so the running service doesn't need a restart to pick up
    a newly-promoted challenger."""
    load_active_models()
    return jsonify({"reloaded": True, "model_version": registry.load_registry().get("current"), "model_metrics": metrics})


@app.post("/predict")
def predict():
    payload = request.get_json(silent=True) or {}
    try:
        row = build_feature_row(payload)
    except ValueError as e:
        return jsonify({"error": "InvalidInput", "message": str(e)}), 400
    except (TypeError, KeyError) as e:
        return jsonify({"error": "InvalidInput", "message": f"Bad input: {e}"}), 400

    condition_pred = int(clf_pipe.predict(row)[0])
    condition_proba = float(clf_pipe.predict_proba(row)[0][1])

    if condition_pred == 1:
        amount_pred = float(reg_pipe.predict(row)[0])
        amount_pred = max(0.0, round(amount_pred, 2))
    else:
        amount_pred = 0.0

    return jsonify({
        "Condition": condition_pred,
        "claim_probability": round(condition_proba, 4),
        "Amount": amount_pred,
    })


@app.post("/predict-llm")
def predict_llm():
    payload = request.get_json(silent=True) or {}
    try:
        build_feature_row(payload)
    except ValueError as e:
        return jsonify({"error": "InvalidInput", "message": str(e)}), 400

    if not GEMINI_API_KEY or genai is None:
        return jsonify({
            "error": "ModelServiceUnavailable",
            "message": "Gemini is not configured. Set GEMINI_API_KEY and install google-generativeai.",
        }), 503

    try:
        prompt = build_llm_prompt(payload)

        contents = [prompt]
        if payload.get("imageData") and payload.get("imageMimeType"):
            try:
                image_bytes = base64.b64decode(payload["imageData"])
            except (ValueError, binascii.Error) as e:
                return jsonify({
                    "error": "InvalidInput",
                    "message": f"imageData could not be decoded as base64: {e}",
                }), 400
            contents.append({
                "mime_type": payload["imageMimeType"],
                "data": image_bytes,
            })

        model = genai.GenerativeModel(GEMINI_MODEL)
        generation_config = {
            "temperature": 0.2,
            "max_output_tokens": 4096,
            # gemini-2.5-flash-lite doesn't think by default (unlike the
            # full "flash" model), but we still try to explicitly disable
            # thinking in case that ever changes, or if GEMINI_MODEL gets
            # switched to a model that does think by default. Reasoning
            # tokens are deducted from max_output_tokens, so leaving
            # thinking on can eat the budget before any visible text is
            # written. This google-generativeai==0.8.6 build predates
            # thinking_config support, so it rejects the field outright —
            # fall back to no thinking_config (relying on the larger token
            # budget above) if that happens.
            "thinking_config": {"thinking_budget": 0},
        }
        try:
            response = model.generate_content(
                contents,
                generation_config=generation_config,
            )
        except Exception:
            generation_config.pop("thinking_config", None)
            response = model.generate_content(
                contents,
                generation_config=generation_config,
            )
        text = response.text
        finish_reason = None
        try:
            finish_reason = response.candidates[0].finish_reason
        except (AttributeError, IndexError):
            pass
        prediction = extract_json_object(text, finish_reason=finish_reason)
        return jsonify(prediction)
    except Exception as e:
        return jsonify({"error": "ModelError", "message": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
