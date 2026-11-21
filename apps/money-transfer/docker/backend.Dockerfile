FROM python:3.13-slim AS base

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv

# Copy workspace root + backend + workflow packages
COPY pyproject.toml uv.lock ./
COPY backend/ backend/
COPY workflows/python/ workflows/python/

# Lints every Python package in the workspace and runs the API's tests: `make test`
FROM base AS test
RUN uv sync --frozen --all-packages \
    && uv run --frozen ruff check . \
    && uv run --frozen pytest -q backend/tests

FROM base

# Install dependencies
RUN uv sync --frozen --no-dev --all-packages

# No hot reload in Docker
ENV BANKING_RELOAD=0

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "--package", "banking-demo-backend", "server"]
