# re:Invent 2026 demos

Temporal's booth demos, launchpad and station controls. Use **main** on the control
laptop and every booth machine.

**Start here:**

- [Control laptop setup](docs/control-setup.md) — commands for Ian's work laptop.
- [Booth setup](docs/booth-setup.md) — commands for a test MacBook or event Mac Mini.

The controller issues a one-time code. Each booth downloads its own configuration
over the LAN, then starts Chrome in kiosk mode. No USB, macOS file sharing, Remote
Login or company credentials are required on the booth machines.

The first preparation downloads/builds Docker dependencies. Recovery uses the
prepared images and saved settings. Actual offline AI/email capabilities are
limited; see the reference below.

[Documentation index](docs/README.md) · [Station design and recovery](docs/STATION-SUPERVISOR.md)

App source is under `apps/`. The single deployment definition is
[deploy/reinvent-2026.yaml](deploy/reinvent-2026.yaml). Preserve `2026-old`; keep
credentials, attendee data and runtime state out of Git.
