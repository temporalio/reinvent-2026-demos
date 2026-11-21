FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --extra aws --extra openai
COPY backend/holodeck/ holodeck/
COPY --from=web /web/dist /app/web-dist
COPY run.py webapp.py ./
ENV PATH="/app/.venv/bin:$PATH" HOLODECK_DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 8080
CMD ["python", "run.py"]
