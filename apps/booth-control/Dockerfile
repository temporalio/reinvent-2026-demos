FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown 10001:10001 /data
WORKDIR /app
# boto3 for the hosted DynamoDB store (CONTROL_TABLE); local runs use SQLite.
# requirements.txt is generated with hashes from requirements.in:
#   uv pip compile --python-version 3.13 --generate-hashes requirements.in -o requirements.txt
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY server.py machines.py ./
COPY tests/ ./tests/
ENV CONTROL_DB=/data/control.sqlite3 CONTROL_LISTEN_ADDRESS=0.0.0.0 CONTROL_PORT=8090 CONTROL_TIMEZONE=America/Denver PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8090
CMD ["python", "server.py"]
