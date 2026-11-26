# Mac station supervisor

The station installer configures a native macOS supervisor, a dedicated Chrome kiosk
profile, and a prepared local Docker stack. Chrome always opens
`http://127.0.0.1:15103/?station=3&managed=1` (use that Mini's station number).
The supervisor routes demo requests to the hosted origin in online mode and the
local Docker gateway in offline mode. `/control-api/` always routes to the laptop.
This keeps camera permissions, station identity, and cached settings on one origin.
It also avoids a cloud page trying to access an insecure private-LAN control hub.

No Temporal, AWS, personal GitHub, or company Docker sign-in is installed by these
scripts. Docker Desktop must still be used under an appropriate license. A browser
GitHub login does not configure the SDLC worker's GitHub token; that remains a
server-side credential, and the default offline SDLC route is a limited preview.

## Before arriving

Clone the complete repo, including its tracked assets and
`apps/launchpad/public/agentcore-video/CD_AgentCoreDemo.mp4`. No Git LFS checkout is
needed for that MP4. The first preparation downloads build tools, base images and
package dependencies; cloning source is not a substitute for preparing images.
Do not depend on event Wi-Fi to build the stack. No assets or images are downloaded
as a recovery step. Existing offline AI/email restrictions still apply.

Use a dedicated booth account when the device owner permits it. The installer does
not change FileVault, automatic login, camera permissions, updates, or power settings.
A borrowed machine whose policy requires a password at boot cannot be made into
an unattended kiosk by this script. Confirm that at the booth rather than weakening
the owner's policy.

## Laptop: start the hub and pair each Mini

Install Docker Desktop and Python 3. From the repo:

```bash
BOOTH_BIND_ADDRESS=0.0.0.0 ./scripts/local.sh up
python3 scripts/setup/export-station-pairing.py \
  --station 3 --hub http://192.168.50.10:15101
```

Startup prints the active LAN addresses and a copyable `CONTROL_HUB_URL` setting when bound to `0.0.0.0`. Use your laptop's reserved private LAN address. Allow its gateway port through the
firewall on that private network only. The exporter saves two ignored files under
`tmp/station-pairing`: the station's JSON pairing file, and `operator.key` for the
laptop. Transfer **only** `station-3.json` to station 3. Repeat for 1, 2, and 4.
These are temporary booth credentials, independent of employee accounts.
Keep the laptop's `control-data` volume: it contains settings and the machine key.
Replacing that volume requires pairing the stations again.

## Mini: prepare once, then install automatic startup

Install Chrome, Docker Desktop, and Python 3; Git is needed if cloning rather than
copying a release bundle. Homebrew is optional. Start Docker and accept its initial
prompts. From the repo, with that station's pairing file copied to Downloads:

```bash
CONTROL_HUB_URL=http://192.168.50.10:15101 ./scripts/local.sh up
./scripts/local.sh station --pairing-file ~/Downloads/station-3.json --dry-run
./scripts/local.sh station --pairing-file ~/Downloads/station-3.json
```

The first command prepares the local stack. The station installer builds the native
executable through Docker, copies it into
`~/Library/Application Support/TemporalReinventStation`, and installs the per-user
`io.temporal.reinvent-station` LaunchAgent. It replaces the old kiosk LaunchAgent.
It starts now and at login. The station key and configuration are mode 0600;
the dedicated browser profile is in that same support directory. Do not put
pairing files in Git. Keep the checkout and `tmp/local/compose.yaml` in place.

Approve the camera and touchscreen permissions while the setup keyboard is still
connected. Test the camera from the **supervisor's localhost URL**, since permissions
for the production origin do not automatically apply to localhost.
Chrome uses `--kiosk`, hiding its tabs, address bar, and bookmarks bar.

## Laptop controls

Open `http://localhost:15101/config` on the laptop, unlock the normal settings, and
choose a station or All stations. Under **Station supervisor**, unlock machine
controls with the contents of the laptop's ignored `tmp/station-pairing/operator.key`.
The key stays in page memory; locking or leaving the page removes it. It is not
sent over the network: requests use HMAC signatures. Never enter that key on a Mini.
The machine controls are omitted from managed station screens.

- **Run online** checks the configured hosted demo before switching. If it cannot
  be reached, the current runtime remains selected and the error is reported.
- **Run locally / offline** starts/checks the prepared stack and switches to it.
- **Choose available runtime** checks the hosted site and uses local when unavailable.
- **Restart booth Chrome** restarts only the supervisor's dedicated Chrome process
  group. It does not run `pkill Chrome` or close other profiles.

Switching mode reloads the browser at the same localhost URL. A running Workflow
remains recorded in its original runtime; it does not migrate between Cloud and OSS.
The Wi-Fi icon shows a reachable hosted runtime; a slash means local mode or that
the hosted connection is unavailable. A LAN link by itself is not internet access.
The old launch-restriction setting is explicitly labeled; it does not switch a
runtime, and managed station browsers follow the runtime actually selected.

## Startup, disconnects and recovery

At boot, the supervisor honors a saved local preference. Otherwise it checks the
configured hosted `/runtime-config.json` with a timeout and uses local if unavailable.
It does not ping Google. Losing internet during a demo updates the icon; it does not
silently replace an attendee's in-flight screen. Staff can switch it from the laptop.

The supervisor polls the laptop every three seconds, whether Chrome works or not.
The browser polls settings every two seconds through the local gateway. A laptop
disconnect preserves the selected runtime, Chrome, and cached browser settings.
Both reconnect automatically. Commands expire after two minutes and an acknowledged
command is saved before acting, preventing replay after restart. Mode preference is
saved locally, so the laptop need not be present after a reboot.

Docker restart policies recover exited long-running containers. The supervisor checks
local container health every 45 seconds and attempts at most three health recoveries
per service per 15 minutes; setup jobs that completed intentionally are excluded.
Browser exits are detected every five seconds. The native command path still works
if browser JavaScript freezes; staff can request a restart. A fully frozen Mac or
unavailable macOS login session remains outside this process's control.

Recovery uses existing images with `--no-build --pull never`, preserves named data
volumes, and never edits source or fetches a newer release. The supervisor retries
initial runtime preparation after failures. Its port binds only to loopback and
rejects unexpected Host headers. Commands and replies are signed with fresh nonces,
route binding and clock checks. Station keys cannot issue operator commands or act
as another station. Signatures do not encrypt traffic; use a private booth LAN and
HTTPS if confidentiality is required. No remote shell endpoint exists.

## Isolated MacBook rehearsal

Use another station number for a test laptop if that number is not already in use.
After preparation and pairing, run:

```bash
./scripts/local.sh station --pairing-file ~/Downloads/station-3.json --test
```

This opens a separate Chrome profile under `tmp/station-test`, runs in the foreground,
and installs no login items. Ctrl-C stops the supervisor and its booth Chrome.
It does not close personal Chrome profiles. Quit another supervisor test first if
port 15103 is occupied. Camera permissions still apply to this separate profile.

Test: online → local → online; laptop disconnected/reconnected; Chrome closed;
local service stopped; saved mode after supervisor restart; then an actual Mini reboot.
For a simulated internet outage, retain LAN connectivity to the laptop. Disconnecting
all networking tests a different condition.

## Maintenance and physical protection

```bash
launchctl bootout "gui/$(id -u)/io.temporal.reinvent-station"
```

That stops the supervisor. Its log is `supervisor.log` in its support directory;
container logs remain available through `./scripts/local.sh logs`. Startup failures
before the log is opened require checking configuration and the LaunchAgent.

Kiosk is presentation, not a security boundary. Use a locked enclosure covering
ports, secure approved camera/touchscreen cables, and block unused accessible ports
and hubs. Do not assume Mac laptop USB accessory approval applies to a Mac Mini.
Use a separate administrator account where the owner permits one. Keep one staff
keyboard/trackpad for OS-level login, permission or hardware failures.

## Validation status

Validation on the MacBook used an isolated headless Chrome profile, a disposable
hosted-mode fixture, the real local preview backend, and a disposable laptop hub:

- Signed online → local → online commands changed the actual gateway backend.
- Closing the dedicated Chrome process caused native recovery; the laptop restart
  command also replaced it. Personal Chrome and Island were not controlled.
- A paused hub left the runtime and browser running; commands worked after reconnect.
- Saved local preference survived supervisor restart, and unavailable hosted startup
  selected the actual local runtime.
- The browser operator UI verified signed status and switched station 3 to local.
  The online indicator and slashed local indicator were checked in the actual DOM.
- Cross-runtime cache reuse was found and fixed: browser startup gets a fresh boot
  URL and document/config responses are not retained across backend switches.

The Go race/vet checks, 46 hub tests, 81 launchpad tests plus typecheck/build, and
39 repository checks pass. No production provider calls or real email sends were
used in the supervisor rehearsal. Fullscreen visual behavior, owner policy, camera
permissions, physical Mini reboot/power recovery, and multi-day stability still
require the hardware acceptance pass. No login item was installed on this MacBook.
