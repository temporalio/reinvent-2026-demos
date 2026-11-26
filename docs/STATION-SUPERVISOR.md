# Station design and recovery

For commands, use [control setup](control-setup.md) or [booth setup](booth-setup.md).
This document explains the design.

## Processes and ports

The control laptop runs a small Docker stack: gateway, static admin frontend and
control hub. No demo workers, Docker socket, home directory or host file share is
published to the booths. The controller has these separate listeners:

| Listener | Purpose |
| --- | --- |
| Laptop LAN IP, port 15101 | One-time pairing downloads, read-only settings and signed station polls |
| Laptop localhost, port 15102 | Private admin UI, login and operator commands |
| Booth localhost, port 15103 | Native supervisor's browser gateway |
| Booth localhost, port 15101 | Prepared local demo stack |

The LAN listener rejects admin/login routes, operator commands, demo APIs and
arbitrary files. It strips cookies from device requests, limits request rates and
body sizes, and has short timeouts. Controller containers have CPU/memory bounds.
The same separation applies to legacy LAN-enabled startup. Localhost-only developer
`up` still serves the normal demo UI on port 15101.

The booth supervisor runs directly on macOS, outside Docker. Chrome keeps one
loopback origin. The supervisor always serves the launchpad, navigation, settings UI and packaged
media from the local stack. Photo Booth HTML/assets are also local so camera
startup and permission guidance match the checkout. Photo Booth API/media and
other demo traffic follow the hosted/local selection;
runtime capabilities come from the selected backend, and control traffic goes to
the laptop. This keeps booth controls current even if a hosted UI deployment lags. Browser station identity, camera permission
and cached settings therefore remain on one origin when the backend changes.

## Network pairing

`pair --station N` on the trusted controller generates a six-digit code, shown
as `123-456`. The booth accepts either format. It expires after two minutes and
permits five exchange attempts for that station, including malformed attempts.
The counter is committed before checking the request and survives hub restarts.
A fresh code from the trusted controller resets the limit; booths cannot reset it.
Successful pairing consumes the code. Interrupted exchanges count as attempts.

The client and controller use [SPAKE2](https://github.com/warner/python-spake2), a
password-authenticated key exchange, with separate client/server confirmations.
The short code is never sent or used alone to derive the permanent key. Fresh
exchange randomness creates a 256-bit station key automatically; neither that key
nor the code crosses the LAN. Nonces, station identity and exchange sessions bind
the confirmations. Re-pairing revokes the station's old key. A replaced or expired
code invalidates pending exchanges. Existing paired machines keep their keys.

Update the checkout on both machines and restart the controller before using short
codes. Outstanding codes from the previous protocol must be regenerated. The
fetch wrapper installs its pinned exchange dependency in the ignored tooling venv.

The fetched config is mode 0600 under `tmp/booth-config/`. Installation copies its
settings into the user's supervisor support directory. The laptop operator key
stays on the laptop, is independent of work accounts, and is never given to a booth.
Machine commands require that stronger key; the date PIN alone cannot issue them.
Public settings contain geometry/demo flags, not provider credentials. A connected
booth's shared settings view is read-only. Device-only fallback edits remain
available when the laptop cannot be reached.

This is an application endpoint, not SMB/NFS, Remote Login or remote desktop. The
setup does not enable those services. The LAN still exposes this limited HTTP
service; Docker is not a guarantee against every host compromise. Use the private
booth LAN, keep the OS/runtime patched, and follow the device owner's policy.

## Startup roles

The repo-root `.env` supplies `ROLE=control` or `ROLE=booth`. Booths also set
`CONTROL_IP` and `BOOTH=1` through `4`. `./scripts/local.sh` selects that role;
`./scripts/local.sh --test` runs a booth rehearsal. A first booth start prompts for
a pairing code before preparing containers. Subsequent starts reuse its saved JSON.
Explicit subcommands and `--station` still work and override the defaults.
The loader reads only these three plain values and never executes shell text;
exported environment values override `.env`. With no role, legacy `up` remains the default.


`control` starts the laptop side and prints both admin and station addresses.
`pair` issues a code; it does not start services. `booth --station N` prepares the
local containers, then launches/installs the native supervisor. It uses the config
fetched for that number. The explicit number must match the pairing file.

`--test` runs a separate Chrome profile under `tmp/station-test` in the foreground
and creates no login item. Ctrl-C stops it and its Chrome. Event installation uses
`io.temporal.reinvent-station`, a per-user LaunchAgent, and
`~/Library/Application Support/TemporalReinventStation`. Chrome uses `--kiosk` to
hide browser chrome. Older file-based `--pairing-file` setup remains available for
compatibility, but current setup requires no file transfer.

The installer does not change FileVault, automatic login, power settings, camera
permissions or device-management policy. An account that requires a password after
boot cannot be made into an unattended GUI kiosk by this script. Test the owner's
actual Mac Mini before removing the setup keyboard.

## Connectivity and recovery

The supervisor polls the laptop every three seconds independently of Chrome.
The browser reads settings every half second through its loopback gateway. It
retains cached settings and its selected runtime while the laptop is absent;
reconnection requires no operator action. Commands expire after two minutes and
acknowledged command IDs are saved before acting.

At startup, a saved local preference stays local. Otherwise an HTTPS runtime check
against the configured hosted site chooses hosted or local. It does not ping
Google. Losing internet during a demo updates the indicator rather than silently
replacing the attendee's screen. Staff can switch from the laptop.

The local launcher is prepared in either mode. In online mode, health recovery
checks its gateway, frontend, local hub and Photo Booth frontend; offline mode checks demo services too.
Docker restart policies recover exited services. Local health recovery runs every
45 seconds, excludes intentionally completed setup jobs, and has retry bounds.
The supervisor restarts only its own Chrome process group, including on a laptop
restart command. It cannot recover a frozen OS or bypass the macOS login screen.
A mode change starts a fresh browser screen. Workflows remain in their original
Cloud/OSS runtime; they do not migrate between them.

Recovery uses cached images with `--no-build --pull never`, preserving named data
volumes. The first installation needs internet to obtain/build dependencies. All
media, including Cornelia's unchanged MP4, is tracked in the repository. Offline
mode supports the local adapters and mocks; it cannot provide real model generation
or email delivery without internet.

## Maintenance and physical security

Stop event auto-launch from a staff Terminal:

```bash
launchctl bootout "gui/$(id -u)/io.temporal.reinvent-station"
```

The supervisor log is in its support directory. Controller/container logs are
available with `./scripts/local.sh logs`. Keep the controller data volume to retain
settings and pairing credentials. Generate event pairing codes on the event LAN;
the download metadata includes the laptop's current address.

Kiosk is presentation, not protection against a hostile USB keyboard. Use a locked
enclosure, protect unused ports and accessible hubs, and secure approved camera and
touchscreen cables. Keep one staff keyboard/trackpad for OS-level failures. Do not
assume Mac laptop USB accessory approval applies to a Mac Mini.

## Validation limits

The original isolated MacBook rehearsal covered native Chrome restart, actual
hosted/local routing, cached settings during hub loss, reconnect, saved mode and
unavailable-hosted startup. Fullscreen visual behavior, camera permissions, physical
Mini reboot/power recovery and multi-day stability remain hardware acceptance work.
Network-pairing and listener isolation have separate tests; a successful build does
not establish those physical checks.
