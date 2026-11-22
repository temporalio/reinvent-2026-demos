# re:Invent 2026 demos

This repo is specifically for AWS re:Invent 2026. One monorepo for the portrait booth launchpad and nine Temporal demos. Contact Ian Douglas or Tomas Josovsky with questions. CODEOWNERS is @iandouglas.

App source is under apps/. The single Fieldkit definition is [deploy/reinvent-2026.yaml](deploy/reinvent-2026.yaml). The launchpad and demos share one core host, using /flightsim/, /photobooth/, /dejavutacos/, and the other routes in the launchpad catalog.

The launchpad uses Ash's Cosmic Pop theme and 25 customer logos, verified against [toolkit PR #5](https://github.com/iandouglas/temporal-toolkit-demo-buildkit/pull/5). Asset hashes and the source commit are recorded in [DESIGN-ASSETS.json](docs/DESIGN-ASSETS.json). Its top marquee moves right to left; the bottom moves left to right. The source archive at 2026-old is unchanged. Dependencies, credentials, attendee data, and nested Git histories were not imported.

This is an initial migration, not a deployed booth release. See [deployment blockers](docs/DEPLOYMENT.md), the [four-station isolation plan](docs/STATION-ISOLATION.md), [migration plan](docs/PLAN.md), and [source inventory](docs/SOURCE-INVENTORY.json). The original per-app runbooks describe their prior standalone layouts/ports; use the root deployment notes for the monorepo.

## Run locally

With Docker Desktop running, use `./scripts/local.sh up`, then open http://localhost:15101. This starts the launchpad, all nine demo presentation routes, Temporal OSS, and Moto. Six demos execute local Temporal workflows, with mock providers for Holodeck. Loan, Agent Harness, and Agentic SDLC provide provider-limited UI/API previews. See [local development](docs/LOCAL-DEVELOPMENT.md) for supported apps and limits.

## Manage the four stations

Open http://localhost:15101/config on the laptop, or tap Ziggy on a station and enter the daily date PIN. Controls include global and per-station demo switches, online/offline launch policy, and saved display width, height, zoom, and position. A station On override takes precedence over global Off; existing demos continue running.

Follow [station control setup](docs/STATION-CONTROL.md) to connect the four Mac gateways to the laptop hub over the private LAN. Settings persist in a local Docker volume. Offline policy does not provision fallback services or change worker connections.

## Local checks

```bash
python3 -m venv tmp/tools
tmp/tools/bin/pip install -r requirements-tooling.txt
tmp/tools/bin/python scripts/validate.py
docker build -t reinvent-2026-launchpad apps/launchpad
docker build -t reinvent-2026-gateway apps/gateway
```

Full platform validation is separate: scripts/validate-fieldkit.sh uses the pinned Fieldkit checkout and currently reports the documented combined AWS/Lambda blocker. These checks do not apply infrastructure or prove Cloud/provider readiness.

Normal hosted booth operation is browser-only. Fieldkit/Docker/kind are for optional local rehearsal or contingency; no offline failover is claimed by this initial port. Provider secrets belong in project-scoped Secrets Manager entries, not repository files or Mac browser configuration.

Imported source retains its existing license notices. No license changes were made during migration.
