# Monorepo plan

The booth uses one Temporal-owned repository, one Fieldkit DemoProject YAML, and one core HTTPS origin. App source lives under apps/. Docker builds remain independent so each app keeps its native language and dependencies.

1. Import the nine existing demos and launchpad; retain the local Taqueria changes. Record source commits. Leave 2026-old untouched.
2. Use Ash's Cosmic Pop assets, interactive orbit screensaver, and customer logos. Top row moves right to left; bottom moves left to right. Keep the logo frame on crew and mission pages.
3. Route /flightsim/, /photobooth/, /dejavutacos/, /banking/, /data-pipeline/, /loans/, /no-roads/, /travel-agent/, and /agentic-sdlc/ through one gateway. Set native frontend bases and browser API paths; preserve backend route contracts.
4. Hand the repository and deploy/reinvent-2026.yaml to the catalog's Add a Demo flow. Michael reviews the one combined resource before it is applied. No changes to the existing catalog demos or platform live directory are made here.
5. Complete the deployment blockers, station isolation, and per-demo Cosmic Pop/three-panel reviews before booth acceptance. Follow-up changes use PRs to main.

## Two operating modes

Hosted operation needs a browser on each Mac Mini, camera permission, and connectivity to the booth URL. Cloud/AWS/provider credentials remain in server-side resources.

Local contingency uses Fieldkit CLI, Docker, kind, and Git. Cache the source and images while online and test the actual CLI support matrix first. An AWS emulator is optional for supported service tests; it does not reproduce AgentCore, hosted AI inference, or every Lambda deployment. Temporal CLI is useful for diagnostics, not required for the normal hosted browser path. The Compose preview described in LOCAL-DEVELOPMENT.md now runs five credential-free demos against local Temporal OSS and Moto. It is generated from the single hosted YAML. Fieldkit local execution still rejects the Lambda-containing combined project.
