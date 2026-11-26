FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm test && npm run build
FROM python:3.13-slim AS runtime
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

# Explicit CI target: provider calls are mocked and no email is sent.
FROM runtime AS python-tests
COPY backend/tests/ tests/
RUN uv sync --frozen --no-install-project --extra aws --extra openai
RUN HOLODECK_DATA_DIR=/tmp/photobooth-tests uv run --no-sync pytest -q \
    tests/test_email.py tests/test_openai_params.py tests/test_api_links.py tests/test_capture_first.py \
    tests/test_photobooth.py::test_pick_four_rules_over_many_seeds \
    tests/test_photobooth.py::test_inspired_prompts \
    tests/test_photobooth.py::test_photo_style_prompts \
    tests/test_photobooth.py::test_heuristic_framing \
    tests/test_photobooth.py::test_mock_never_cuts_out_the_visitor \
    tests/test_photobooth.py::test_cinematic_prompts_prioritize_action_and_scenery \
    tests/test_photobooth.py::test_featured_strips_choose_four_distinct_adventures_with_varied_order

# Replay and ordering checks use a private local server and fake Activities.
FROM python-tests AS workflow-tests
COPY --from=temporalio/temporal:1.8.3 /usr/local/bin/temporal /usr/local/bin/temporal
RUN TEST_TEMPORAL_BINARY=/usr/local/bin/temporal HOLODECK_DATA_DIR=/tmp/photobooth-workflow-tests \
    uv run --no-sync pytest -q tests/test_capture_workflow.py

FROM runtime AS final
