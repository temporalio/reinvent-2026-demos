# Local booth preview

Run from the monorepo root with Docker Desktop running and Python 3 available:

```bash
./scripts/local.sh up
```

Open http://localhost:15101. Temporal OSS is available through the same gateway at http://localhost:15101/_temporal/primary/namespaces/default/workflows, or with the CLI at localhost:17234. Moto listens on localhost:15001. All published ports bind to loopback.

For a smaller first run:

```bash
./scripts/local.sh up --apps tacos
./scripts/local.sh status
./scripts/local.sh logs tacos-worker
./scripts/local.sh down
```

The generator reads deploy/reinvent-2026.yaml and writes ignored runtime files under tmp/local/. There is no second maintained deployment YAML. Hosted resources are not modified. Re-run up after source changes to rebuild. The scripts bootstrap a local Python tooling environment if needed.

## Local execution modes

All nine routes are available by default. The launchpad and native apps show the active mode.

| Demo | Local mode |
| --- | --- |
| Tacos | Python API/worker, real Temporal Workflows |
| Money Transfer | Python API/worker, real Temporal Workflows |
| Data Pipeline | Flask UI/Python worker, real Temporal Workflows |
| Flight Simulator | API/worker, mock providers |
| Photo Booth | API/worker, mock images and local email outbox |
| No Roads | Native versioned worker and real backlog/concurrency; Lambda scaling is not emulated |
| Loan | Real forms/profiles/API; inference/decision mutations return explicit 503 until a provider is configured |
| Agent Harness | Real web app and Temporal-backed reads; model actions disabled |
| Agentic SDLC | Real web app, Temporal-backed reads, Redis; GitHub/model actions disabled |

Use `--apps` to run a smaller subset. Unknown demo IDs fail explicitly. No real provider keys are inherited. See [serverless local modes](SERVERLESS-LOCAL.md) and [agent previews](AGENTS-LOCAL.md) for the exact guards and limits.

Moto seeds the S3 buckets declared in the production YAML. It is not a replacement for every AWS service. Its storage is in memory and lost when recreated. Photo Booth still uses its existing local files; declaring an emulated bucket does not migrate those files into S3. Temporal and Photo Booth/Flight Simulator state use Docker volumes. Down preserves those volumes. Only use synthetic attendee data during development.

No Cloud credentials or model/email provider credentials are inherited from your shell. A deliberate provider-enabled local mode is future work. The initial temporalio/temporal container uses its development server, not a production HA installation.

## Portrait layout

All nine demo entries use the portrait presentation path. Tacos retains its native two upper panels plus four lower tabs. Banking, Pipeline, No Roads, Loan, Travel, and SDLC have paired native interaction/presenter areas inside one live application frame. Flight and Photo Booth retain a combined upper area. Every demo has the lower business, architecture, source, and Temporal UI views.

The shared frame and embedded apps load Ash's Cosmic Pop theme. Full native navigation preserves booth styling. The architecture tab is a labeled deployment overview, not live telemetry. The code tab displays actual repository excerpts in their native language; translated SDK examples remain future work. Local Temporal UI uses the local route; hosted publication remains a deployment gate. Parent navigation accepts only same-origin messages from the active application iframe.

The local Ziggy controls are display preview controls, not the PIN-protected fleet control panel. Fleet configuration, touch keyboard, and panel-specific pinch gestures still need implementation and physical-screen testing.
