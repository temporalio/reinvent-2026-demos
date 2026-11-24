FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv
WORKDIR /app
COPY . .
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH" PYTHONPATH=/app
EXPOSE 8080
CMD ["flask", "--app", "ui/app", "run", "--host", "0.0.0.0", "--port", "8080"]

# The test image carries the CLI so integration tests need no external services or downloads.
FROM runtime AS test
COPY --from=temporalio/temporal:1.8.3 /usr/local/bin/temporal /usr/local/bin/temporal
ENV TEMPORAL_CLI_PATH=/usr/local/bin/temporal

FROM runtime AS final
