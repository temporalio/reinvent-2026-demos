# re:Invent 2026 demos

This repo is specifically for AWS re:Invent 2026. One monorepo for the portrait booth launchpad and nine Temporal demos. Contact Ian Douglas or Tomas Josovsky with questions. CODEOWNERS is @iandouglas.

App source is under apps/. The single Fieldkit definition is [deploy/reinvent-2026.yaml](deploy/reinvent-2026.yaml). The launchpad and demos share one core host, using /flightsim/, /photobooth/, /dejavutacos/, and the other routes in the launchpad catalog.

The launchpad uses Ash's Cosmic Pop theme and 25 customer logos, verified against [toolkit PR #5](https://github.com/iandouglas/temporal-toolkit-demo-buildkit/pull/5). Asset hashes and the source commit are recorded in [DESIGN-ASSETS.json](docs/DESIGN-ASSETS.json). Its top marquee moves right to left; the bottom moves left to right. The source archive at 2026-old is unchanged. Dependencies, credentials, attendee data, and nested Git histories were not imported.

This is an initial migration, not a deployed booth release. See [deployment blockers](docs/DEPLOYMENT.md), the [four-station isolation plan](docs/STATION-ISOLATION.md), [migration plan](docs/PLAN.md), and [source inventory](docs/SOURCE-INVENTORY.json). The original per-app runbooks describe their prior standalone layouts/ports; use the root deployment notes for the monorepo.

## Run locally

With Docker Desktop running, use `./scripts/local.sh up`, then open http://localhost:15101. This starts the launchpad, all nine demo presentation routes, Temporal OSS, and Moto. Six demos execute local Temporal workflows, with mock providers for Holodeck. Loan, Agent Harness, and Agentic SDLC provide provider-limited UI/API previews. See [local development](docs/LOCAL-DEVELOPMENT.md) for supported apps and limits.

## Control laptop or booth machine

`./scripts/local.sh --help` describes both roles. On the **control laptop**, run
`./scripts/local.sh control`, then `./scripts/local.sh pair --station 3`. Copy the
resulting `tmp/station-pairing/station-3.json` to Downloads on the **demo MacBook or
Mac Mini**. On that machine, run:

```bash
./scripts/local.sh booth --station 3 --pairing-file ~/Downloads/station-3.json --test
```

This prepares its containers and launches a separate Chrome kiosk profile. Test mode
adds no login item; omit `--test` on the event Mini to install automatic startup.
The plain `up` command starts containers only. Keep `operator.key` on the laptop.
See the [complete station setup](docs/STATION-SUPERVISOR.md).

## Manage the four stations

Open http://localhost:15101/config on the laptop, or tap Ziggy on a station and enter the daily date PIN. Controls include global and per-station demo switches, online/offline launch policy, and inherited defaults for display width, height, zoom, position, and Temporal UI zoom. Each station can override individual fields or return them to Use global. The layout editor shows a live red outline before saving. A station On override takes precedence over global Off; existing demos continue running.

Follow [station control setup](docs/STATION-CONTROL.md) to connect the four Mac gateways to the laptop hub over the private LAN (local runs; settings persist in a local Docker volume), or for the hosted booth, where settings are kept in DynamoDB and staff unlock `/config` with the daily date PIN. Offline policy does not provision fallback services or change worker connections.

See [touchscreen presentation](docs/TOUCHSCREEN-UI.md) for panel fitting, idle behavior, SDK excerpts, and position preview. The [SDLC GitHub setup](docs/AGENTIC-SDLC-GITHUB.md) covers the dedicated demo account and sandbox repository.

## Mac Mini station supervisor

Use the [station supervisor setup](docs/STATION-SUPERVISOR.md) for the event machines.
It installs a native macOS helper that routes a stable localhost browser URL to the
hosted or prepared local runtime, accepts signed laptop commands, and recovers the
dedicated Chrome process. It needs no company sign-in on the Mini. The first setup
still downloads/builds dependencies; reboot recovery reuses cached images and data.
Use its isolated `--test` mode to rehearse on a MacBook without adding login items.

## Mac Mini kiosk setup and recovery (legacy launcher)

The legacy launcher below has no native restart or online/local switching. For those controls use the supervisor above. Use a dedicated booth macOS account on each borrowed Mac Mini. Normal hosted operation needs Google Chrome and internet access; it needs no Docker, AWS login, provider keys, or personal account on the Mini. Run the commands below on each **Mac Mini**, from this checkout.

### 1. Prepare the Mac and stylus

- Install Google Chrome in `/Applications`. Set the display's final orientation and resolution. Connect its USB touch input as well as video, install the display vendor's macOS driver if required, and verify stylus taps and drags work.
- In **System Settings → Users & Groups**, configure **Automatically log in as** for the booth account, with the device owner's approval. FileVault or management policy can require manual login; a browser LaunchAgent cannot bypass that. See [Apple's automatic-login instructions](https://support.apple.com/en-us/102316).
- In **System Settings → Energy**, enable recovery after a power failure. Depending on the Mac, this is **Start up automatically after a power failure** or **Start up when power is connected → After power failure**. See [Apple's desktop energy settings](https://support.apple.com/en-za/guide/mac-help/-mchlp1168/mac).
- Set screen-lock/screen-saver behavior for the event with the owner. The launcher prevents idle display/system sleep while Chrome runs; it does not bypass a locked account.

### 2. Prepare a persistent booth browser profile

Use a different station number, **1–4**, on each Mini. First open the booth profile without kiosk mode so you can handle permission prompts:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/Library/Application Support/TemporalReinventKiosk/browser" \
  --no-first-run --no-default-browser-check \
  "https://reinvent-booth.tmprl-demo.cloud/?station=1"
```

Allow the photo booth's camera access in both Chrome and macOS when prompted, select the camera, and verify the stylus can use the app's buttons and on-screen keyboard. Tap Ziggy to open staff controls and verify the machine's station identity. Quit this booth browser before installing auto-launch so Chrome starts with its new flags.

Keep this same profile and URL origin. The profile stores the station ID and last valid configuration, including global defaults and station overrides, across reboots. Do not use Guest/Incognito or clear the profile between shifts. A fresh browser without a cache uses built-in defaults. Cached settings do not provide offline hosting: the browser still needs to reach the demo URL, and cloud demos still need internet access.

### 3. Install login auto-launch

Review the settings without changing this Mac:

```bash
./scripts/setup/install-mac-kiosk.sh --station 1 --dry-run
```

Then install, changing the station number for each Mini:

```bash
./scripts/setup/install-mac-kiosk.sh --station 1
```

The installer creates a per-user LaunchAgent named `io.temporal.reinvent-kiosk`, copies its launcher into `~/Library/Application Support/TemporalReinventKiosk`, and starts Chrome in **kiosk mode** without browser tabs or the address bar. It waits for the demo origin to become reachable, uses the persistent `browser` directory above, and relaunches Chrome if it exits. It does not change automatic-login, FileVault, or power-recovery settings. See [Chromium's profile documentation](https://www.chromium.org/developers/creating-and-using-profiles/), [kiosk switch](https://chromium.googlesource.com/chromium/src/+/7837615375f73fe6ff4de0b8f9d8ea70ddf35cfd/chrome/common/chrome_switches.cc), and [Apple's LaunchAgent documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

Staff can tap Ziggy and use the date PIN, stylus, and on-screen controls without leaving kiosk mode. On your laptop, open [the hosted control panel](https://reinvent-booth.tmprl-demo.cloud/config), choose **All stations** or a specific station, and save changes. The hosted setup needs no laptop IP address: all four browsers poll the shared hosted hub.

### 4. Optional local demo stack and laptop LAN hub

`local.sh` starts services; it does not launch Chrome or inject browser settings. The Mini's gateway proxies `/control-api/` to `CONTROL_HUB_URL`. The browser polls that same-origin endpoint every two seconds, selects its station's effective settings, and applies the frame layout and zoom directly. Global defaults and station overrides are cached in the browser profile. The kiosk launcher below starts Chrome with the station URL and can start the prepared local stack at login.

For local rehearsal, prepare the stack once while online. On the laptop:

```bash
BOOTH_BIND_ADDRESS=0.0.0.0 ./scripts/local.sh up
```

On each Mini, replace the example address with the laptop's private LAN IP:

```bash
CONTROL_HUB_URL=http://192.168.50.10:15101 ./scripts/local.sh up
./scripts/setup/install-mac-kiosk.sh --station 1 \
  --url http://localhost:15101 --local-repo "$(pwd)"
```

Reserve the laptop's LAN address so it does not change between shifts. Allow its gateway port through the macOS firewall. The launcher opens Docker Desktop, waits for its engine, and starts the already-prepared Compose stack without rebuilding or re-rendering it, preserving the saved hub address. Keep the checkout and `tmp/local/compose.yaml` in place, and cache all required images before the event. Local provider limits still apply; see [local development](docs/LOCAL-DEVELOPMENT.md) and [station controls](docs/STATION-CONTROL.md).

The laptop can leave the LAN: the Minis catch hub failures, retain cached settings, and retry in the background. Remote configuration resumes when the hub returns. After a reboot, the local stack and browser must start successfully before cached settings can be applied. The cached configuration is not a replica of the laptop's database.

### 5. Staff exit, logs, and acceptance test

To stop automatic relaunch for maintenance, use a staff keyboard/Terminal on the Mini:

```bash
launchctl bootout "gui/$(id -u)/io.temporal.reinvent-kiosk"
```

Then quit the booth Chrome process. To re-enable it:

```bash
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/io.temporal.reinvent-kiosk.plist"
```

Logs are in `~/Library/Logs/TemporalReinventKiosk/`. Kiosk mode is a presentation mode, not a macOS security boundary. Normal demo navigation and Ziggy controls work by stylus, but keep one staff keyboard/trackpad available for OS login, permission dialogs, or maintenance. The launcher restarts Chrome when it exits; it does not detect a frozen browser or operating system.

Before the show, test each physical Mini: save a distinct station setting, disconnect the laptop from the LAN, reboot, and confirm the correct station opens without browser chrome and retains its cached layout. Reconnect the laptop and verify a saved change arrives without reloading the demo. Also test camera permissions, stylus taps/drags, the on-screen keyboard, and the power-recovery path. **These physical-machine checks have not been performed by the installer or by repository tests.**

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

Dependency updates are checked against affected application builds and provider-free runtime tests. See [dependency compatibility](docs/DEPENDENCY-COMPATIBILITY.md) for the current changes and limits.
