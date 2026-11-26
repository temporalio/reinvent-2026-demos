# Booth MacBook / Mac Mini setup

Run these on the **demo machine**. Install Chrome, Docker Desktop, Git and Python 3.
Use its assigned station number: **1, 2, 3 or 4**. Examples below use **3**.

## First checkout

```bash
git clone https://github.com/temporalio/reinvent-2026-demos.git "$HOME/reinvent-2026-demos"
cd "$HOME/reinvent-2026-demos"
```

For an existing checkout, open Terminal in that repo, then:

```bash
git switch main
git pull --ff-only
```

## Set this machine's role

Replace the IP with the address printed on the controller, and use this booth's number:

```bash
cat > .env <<'ENV'
ROLE=booth
CONTROL_IP=192.168.86.108
BOOTH=3
ENV
```

Ask the controller operator to run `./scripts/local.sh pair --station 3` just
before your first startup. Enter the six-digit code (`123-456` or `123456`) within
two minutes. After five attempts, request a new code. Later starts
reuse the saved key. `.env` stays local and contains no work credentials.

## Personal MacBook rehearsal

```bash
./scripts/local.sh --test
```

This prepares containers and opens kiosk Chrome. It installs no login item.
Cmd-Tab to Terminal and press Ctrl-C to stop the test.

## Event Mac Mini

```bash
./scripts/local.sh
```

This prepares containers and installs the supervisor to start Chrome at login.
Before unplugging the setup keyboard:

- Open Photo Booth once and approve the camera prompts.
- Confirm touchscreen/stylus input.
- With the owner's approval, configure automatic login and power-failure recovery.
- Test an actual reboot. FileVault or management policy may require manual login.

## Load the laptop's iframe preset

Tap Ziggy, unlock the booth's display controls and choose
**Load control iframe default**. It keeps a local copy for use when the laptop is
offline. Local adjustments briefly show a red outline; save them on that browser.

After pulling updates, run `./scripts/local.sh` again. This refreshes the local
launchpad and supervisor as well as the demo containers; saved pairing remains.

## Check a connection or container problem

```bash
curl --max-time 5 http://192.168.86.108:15101/control-api/healthz
./scripts/local.sh status
```

Expected health response: `{"ok":true}`. No new code is needed after normal reboot.
To re-pair, run `./scripts/fetch-booth-config.sh 192.168.86.108 3` with a fresh
code, then run `./scripts/local.sh` again.

[Control-laptop commands](control-setup.md) · [How it works](STATION-SUPERVISOR.md)
