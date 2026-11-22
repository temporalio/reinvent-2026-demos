FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown 10001:10001 /data
WORKDIR /app
COPY server.py ./
COPY tests/ ./tests/
ENV CONTROL_DB=/data/control.sqlite3 CONTROL_LISTEN_ADDRESS=0.0.0.0 CONTROL_PORT=8090 CONTROL_TIMEZONE=America/Denver PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8090
CMD ["python", "server.py"]
