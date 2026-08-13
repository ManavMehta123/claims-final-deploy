"""
Continuous Learning Pipeline — Data Ingestion DAG.

Runs on a schedule (default: daily at 02:00) and pulls every claim that
has been decided (Approved/Rejected) by an admin since the last run,
validates it, and appends it to ml-service/data/live_feedback.csv. See
ml-service/ingestion/ingest.py for the actual logic — this DAG is a thin
scheduling wrapper around it so the ingestion script stays runnable and
testable completely outside of Airflow too.

On success it triggers `continuous_retraining_dag`, so a batch of freshly
labeled claims automatically becomes an opportunity to retrain rather
than sitting unused until the next calendar-scheduled retrain.
"""
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

default_args = {
    "owner": "ml-platform",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


def _run_ingestion(**context):
    import sys

    sys.path.insert(0, "/opt/ml-service")
    sys.path.insert(0, "/opt/ml-service/ingestion")
    import ingest  # noqa: E402

    result = ingest.run()
    # Surface the row counts in the Airflow UI (Grid -> task -> XCom) and
    # let downstream tasks (e.g. a conditional retrain trigger) see them.
    context["ti"].xcom_push(key="ingestion_result", value=result)
    if result.get("rejected"):
        print(f"WARNING: {result['rejected']} row(s) failed validation — see rejected_detail in the task log/XCom.")
    return result


with DAG(
    dag_id="data_ingestion_dag",
    description="Pull newly-decided claims from the backend and append them to the live-feedback training set.",
    default_args=default_args,
    schedule_interval="0 2 * * *",  # daily at 02:00
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "continuous-learning", "ingestion"],
) as dag:
    ingest_task = PythonOperator(
        task_id="ingest_new_claims",
        python_callable=_run_ingestion,
    )

    trigger_retraining = TriggerDagRunOperator(
        task_id="trigger_retraining_dag",
        trigger_dag_id="continuous_retraining_dag",
        wait_for_completion=False,
    )

    ingest_task >> trigger_retraining
