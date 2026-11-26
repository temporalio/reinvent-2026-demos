# Data Pipeline Runbook

These updates are only for AWS re:Invent 2026. This repository's main branch is the re:Invent demo version. Contact Ian Douglas or Tomas Josovsky with questions.

[Setup and Walkthrough](#setup-and-walkthrough) | [Booth Setup](#reinvent-2026-booth-setup) | [README](README.md)

## Setup and Walkthrough

Install with `uv sync`. Run `uv run python worker.py` and `uv run python ui/app.py` from the repo root in separate terminals, alongside `temporal server start-dev`. The upstream UI defaults to localhost:8080. For Cloud API keys, set `TEMPORAL_HOST_URL`, `TEMPORAL_NAMESPACE` and `TEMPORAL_API_KEY` in both processes. The booth branch adds API-key support; upstream originally uses mTLS. Add `Step` (Keyword) for AdvancedVisibility. Start with HappyPath, then exercise the signal/update scenarios. Verify each result and Activity retry in Temporal UI. Stop with Ctrl-C; keep `demodata/` intact.

## RecoverableFailure on the Touchscreen

1. Select **RecoverableFailure**, then launch the pipeline.
2. After transformation, a simulated code bug pauses the Workflow at a durable checkpoint. Completed Activities remain recorded; the Workflow stays open.
3. Tap **Fix code and resume**. Explain: "At your company, this would be a code fix deployed to your workers. This button simulates that deployment."
4. Watch the same Workflow ID and Run ID proceed to loading and completion. Open **View workflow** in the lower panel to inspect completed Activities and the recovery Signal. Earlier Activities are not repeated.

The checkpoint avoids failed-task retry backoff delaying an attendee's tap. The booth uses a durable `demo_fix_code` Signal to enable a corrected branch already in the demo worker. The button does not deploy code or restart the worker, and it cannot repair arbitrary bugs. It appears only after this scenario reaches the recovery checkpoint. Other scenarios and closed runs cannot use this control. Repeated taps are safe; a failed request can be retried.

An upgraded worker is required once to install this booth control. Each attendee can then recover their own run without operator intervention. A previously stuck recoverable run can also receive the Signal after the updated worker is installed.

## Sources

[Source README](README.md), [Temporal CLI](https://docs.temporal.io/cli).

## re:Invent 2026 Booth Setup

These updates are only for AWS re:Invent 2026. This repository's main branch is the re:Invent demo version. Contact Ian Douglas or Tomas Josovsky with questions.

The laptop bundle uses this demo's source instructions with a separate UI port and a laptop-specific task queue. From the parent `new-demos/` folder, run `./bundle-setup.sh --only data-pipeline` and `python3 bundle.py panel`, then start **Data Pipeline** in [Config](http://127.0.0.1:5199/config). UI: [localhost:5330](http://127.0.0.1:5330/).

Use the shared `.env` from 1Password at the bundle root. Keep machine identity in `.env.local`. The panel keeps local Temporal running in Cloud mode and restarts this demo's owned processes when switching targets. See the [bundle runbook](../RUNBOOK.md) for Cloud prerequisites, offline limits and verification. Runtime is not verified by installation alone.
