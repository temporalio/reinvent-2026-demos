# The on-call agent's Worker image. AgentCore runs ARM64 containers only, so this
# builds for whichever platform buildx asks for (no --platform pins); CI and the
# platform build it as linux/arm64.
# Versions checked on 2026-11-23: python 3.14.10 (Docker Hub), uv 0.13.9 (GitHub releases).
FROM ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d AS uv

FROM python:3.14.10-slim-trixie@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f AS base
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/venv PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-default-groups --no-install-project

FROM base AS test
RUN uv sync --locked --group test --no-install-project
COPY . .
CMD ["/venv/bin/python", "-m", "pytest", "-q"]

FROM python:3.14.10-slim-trixie@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f AS runtime
COPY --from=base /venv /venv
WORKDIR /app
COPY agentcore_worker.py ./
COPY oncall ./oncall
ENV PATH=/venv/bin:$PATH PYTHONUNBUFFERED=1
USER 65532:65532
EXPOSE 8080
CMD ["python", "agentcore_worker.py"]
