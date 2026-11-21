FROM node:22-slim AS browser-vendor
WORKDIR /loan/frontend-vendor
COPY frontend-vendor/package.json frontend-vendor/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY frontend-vendor/vendor.mjs frontend-vendor/assessment-renderer.js ./
RUN npm run build

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
COPY --from=browser-vendor /loan/static/vendor ./static/vendor
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--root-path", "/loans"]
