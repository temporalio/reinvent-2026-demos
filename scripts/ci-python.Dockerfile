FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv
COPY python-compatibility.py /ci/python-compatibility.py
ENTRYPOINT ["python", "/ci/python-compatibility.py"]
