"""
Continuous Learning Pipeline — Retraining DAG.

Triggered automatically by data_ingestion_dag after a successful ingest,
and also runs on its own weekly safety-net schedule (Sundays 03:00) in
case ingestion ran but this DAG was skipped for some reason.

Steps:
  1. train_challenger   — train.py trains a new model version WITHOUT
                           promoting it (a "challenger").
  2. evaluate_and_promote — compare the challenger's metrics to the
                           current champion; promote only if it doesn't
                           regress beyond the tolerance in
                           evaluate_and_promote.py.
  3. reload_serving_model — if promoted, tell the running ml-service
                           Flask process to reload so the new champion
                           serves traffic immediately (no restart).

If evaluation rejects the challenger, the DAG still finishes
successfully — a rejected challenger is a normal, expected outcome, not
a pipeline failure. It stays in the registry for later inspection
(`python rollback.py list`) or manual promotion.
"""
import os
from datetime import datetime, timedelta

import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

default_args = {
    "owner": "ml-platform",
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
}

ML_SERVICE_URL = os.environ.get("ML_SERVICE_URL", "http://ml-service:5001")


def _train_challenger(**context):
    import sys

    sys.path.insert(0, "/opt/ml-service")
    import train  # noqa: E402

    version, metrics = train.train(promote=False)
    context["ti"].xcom_push(key="challenger_version", value=version)
    print(f"Trained challenger {version}: {metrics}")
    return version


def _evaluate_and_promote(**context):
    import sys

    sys.path.insert(0, "/opt/ml-service")
    import evaluate_and_promote  # noqa: E402

    version = context["ti"].xcom_pull(task_ids="train_challenger", key="challenger_version")
    result = evaluate_and_promote.evaluate_and_promote(version)
    context["ti"].xcom_push(key="promotion_result", value=result)
    return result


def _reload_serving_model(**context):
    result = context["ti"].xcom_pull(task_ids="evaluate_and_promote", key="promotion_result")
    if not result or result.get("outcome") != "PROMOTED":
        print("Challenger was not promoted — nothing to reload.")
        return {"reloaded": False}

    resp = requests.post(f"{ML_SERVICE_URL}/model/reload", timeout=30)
    resp.raise_for_status()
    print(f"ml-service reloaded: {resp.json()}")
    return resp.json()


with DAG(
    dag_id="continuous_retraining_dag",
    description="Train a challenger model, evaluate it against the champion, and promote it if it's good enough.",
    default_args=default_args,
    schedule_interval="0 3 * * 0",  # weekly safety net (Sundays 03:00); also triggered by data_ingestion_dag
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "continuous-learning", "retraining"],
) as dag:
    train_task = PythonOperator(
        task_id="train_challenger",
        python_callable=_train_challenger,
    )

    evaluate_task = PythonOperator(
        task_id="evaluate_and_promote",
        python_callable=_evaluate_and_promote,
    )

    reload_task = PythonOperator(
        task_id="reload_serving_model",
        python_callable=_reload_serving_model,
    )

    train_task >> evaluate_task >> reload_task
