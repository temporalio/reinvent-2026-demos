# Control laptop setup

Run these on the **work laptop**. Install Docker Desktop, Git and Python 3 first.
Connect all machines to the booth LAN. No file sharing or Remote Login is needed.

## First checkout

```bash
git clone https://github.com/temporalio/reinvent-2026-demos.git "$HOME/reinvent-2026-demos"
cd "$HOME/reinvent-2026-demos"
```

For an existing checkout, open Terminal in that repo.

## Set this machine's role

```bash
cat > .env <<'ENV'
ROLE=control
ENV
```

## Start the controller

```bash
git switch main
git pull --ff-only
./scripts/local.sh
open http://localhost:15102/config
```

Startup prints the LAN IP to use on the booths. The admin page is localhost-only.

## Pair the booth you are setting up now

For booth 3:

```bash
./scripts/local.sh pair --station 3
```

Read the printed one-time code to the person running the booth's fetch command.
The six-digit code looks like `123-456`. It expires in two minutes, allows at most
five attempts, and works once. Repeat for stations 1, 2 and 4
when each is ready. No file needs copying.

## Unlock restart and online/offline controls

```bash
cat tmp/station-pairing/operator.key
```

Enter that key in **Station supervisor** on this laptop's admin page. Keep it here.

## Restart services or check them

```bash
./scripts/local.sh
./scripts/local.sh status
./scripts/local.sh logs control-hub
```

Keep the controller's Docker data volume. It stores settings and pairing credentials.
Booths retain their last settings when this laptop leaves the LAN.

[Booth commands](booth-setup.md) · [How it works](STATION-SUPERVISOR.md)
