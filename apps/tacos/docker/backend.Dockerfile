FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv

# Copy workspace root + backend + workflow packages
COPY pyproject.toml uv.lock ./
COPY backend/ backend/
COPY workflows/python/ workflows/python/

# Install dependencies
RUN uv sync --frozen --no-dev --all-packages

# No hot reload in Docker
ENV DEJAVU_RELOAD=0

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "--package", "dejavu-tacos-backend", "server"]
