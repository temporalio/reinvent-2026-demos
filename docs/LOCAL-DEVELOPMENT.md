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

## Supported local apps

- Tacos: Python API and worker, real Temporal OSS workflows.
- Money Transfer: Python API and worker, real Temporal OSS workflows.
- Data Pipeline: Flask UI and Python worker, real Temporal OSS workflows.
- Flight Simulator: local API and worker; mock providers.
- Photo Booth: local API and worker, mock images and local email outbox. No OpenAI or SendGrid keys are passed.

Only selected apps are enabled in the local launchpad. Loan, No Roads, Agent Harness, and Agentic SDLC do not yet have verified local adapters in this runner. They remain in the production YAML and shared presentation layout. The runner refuses to imply that Lambda, Bedrock, AgentCore, or GitHub are emulated.

Moto seeds the S3 buckets declared in the production YAML. It is not a replacement for every AWS service. Its storage is in memory and lost when recreated. Photo Booth still uses its existing local files; declaring an emulated bucket does not migrate those files into S3. Temporal and Photo Booth/Flight Simulator state use Docker volumes. Down preserves those volumes. Only use synthetic attendee data during development.

No Cloud credentials or model/email provider credentials are inherited from your shell. A deliberate provider-enabled local mode is future work. The initial temporalio/temporal container uses its development server, not a production HA installation.

## Portrait layout

All nine demo entries use the portrait presentation path. Tacos retains its native two upper panels plus four lower tabs. Other apps use one upper application frame, preserving their interaction and controls in the same browser session, plus the shared lower four-tab panel. Banking's embed adapter arranges its customer and backstage panes side by side and removes the duplicate native code pane. Apps with a single interaction surface keep a combined upper area.

The shared frame and embedded apps load Ash's Cosmic Pop theme when launched with booth=1. The architecture tab is a labeled deployment overview, not live telemetry. The code tab displays actual repository excerpts in their native language, not translated SDK examples. Temporal UI uses the local runtime route; hosted publication remains a deployment gate. Per-demo live architecture animation, translated SDK examples, and full visual/content reviews remain unfinished.

The local Ziggy controls are display preview controls, not the PIN-protected fleet control panel. Fleet configuration, touch keyboard, and panel-specific pinch gestures still need implementation and physical-screen testing.
