# Extends the official Airflow image with only the Python dependencies
# the DAG-imported modules actually need (pandas, scikit-learn, mlflow,
# joblib, requests — see requirements-airflow.txt) so dags/ can
# `import train`, `import ingest`, etc. directly instead of shelling out
# to a separate container per task.
FROM apache/airflow:2.9.3-python3.11

# IMPORTANT: install against Airflow's own constraints file for this
# exact Airflow + Python version. Without it, pip is free to upgrade
# packages Airflow itself depends on (Flask, SQLAlchemy, etc.), which
# breaks the webserver/scheduler at runtime even though the image builds
# successfully. requirements-airflow.txt (deliberately a *subset* of
# ml-service/requirements.txt, excluding Flask/gunicorn/
# google-generativeai — see that file's comment) plus this constraints
# file together keep Airflow's own dependency tree intact.
ARG AIRFLOW_VERSION=2.9.3
ARG PYTHON_VERSION=3.11
ARG CONSTRAINT_URL="https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt"

COPY airflow/requirements-airflow.txt /opt/ml-service/requirements-airflow.txt
RUN pip install --no-cache-dir -r /opt/ml-service/requirements-airflow.txt --constraint "${CONSTRAINT_URL}"
