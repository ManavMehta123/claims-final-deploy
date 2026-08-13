FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY registry.py .
COPY train.py .
COPY evaluate_and_promote.py .
COPY rollback.py .
COPY ingestion/ ./ingestion/
COPY artifacts/ ./artifacts/
COPY data/ ./data/

ENV ARTIFACT_DIR=/app/artifacts
ENV PORT=5001
EXPOSE 5001

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "app:app"]
