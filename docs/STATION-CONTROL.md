# Booth station controls

For native browser restart and actual online/local runtime switching, use the [macOS station supervisor](STATION-SUPERVISOR.md). The settings-only browser client described below does not perform that switch.

The laptop runs the shared control hub. Each station uses its own local demo gateway and proxies `/control-api/` to that hub. The browser keeps a station ID from 1 through 4; the laptop's `/config` view can manage any station or the global policy. Tap Ziggy to enter the touch PIN screen. The daily PIN is the month and day in the hub's configured timezone, `America/Denver` by default, such as `1130` on November 30.

## Laptop and four Mac Minis

Use the same reviewed checkout and Docker Desktop on each machine. Start the laptop's gateway with deliberate LAN access:

```bash
BOOTH_BIND_ADDRESS=0.0.0.0 ./scripts/local.sh up
```

Find the laptop's private LAN IP in macOS network settings and allow inbound access to the gateway port when macOS requests it. The default port is 15101. Open http://localhost:15101/config on the laptop.

On each Mac Mini, point its gateway to that laptop IP, for example:

```bash
CONTROL_HUB_URL=http://192.168.50.10:15101 ./scripts/local.sh up
```

Open http://localhost:15101/?station=1 on station 1, and use `station=2`, `station=3`, and `station=4` for the other stations. The station gateway stays bound to loopback. The laptop gateway binds all network interfaces only because `BOOTH_BIND_ADDRESS=0.0.0.0` was supplied. Temporal and Moto ports remain loopback-only on every machine.

`CONTROL_HUB_URL` accepts a base HTTP(S) origin with an optional port, not a path, query, credentials, or arbitrary nginx syntax. Use a reachable private IP for the laptop rather than assuming Docker can resolve a `.local` mDNS hostname. HTTPS upstreams use SNI and verify their certificates against the gateway image's CA bundle; self-signed HTTPS is not silently accepted. The documented private-LAN example uses HTTP.

Re-run the command with the same environment when rebuilding a station. The generated Compose file remembers the chosen address until the next `up` or `render`. Running `up` without `CONTROL_HUB_URL` reconnects that machine's gateway to its own local hub.

## Saved settings and hub outages

The local stack always includes `control-hub` and a named `control-data` Docker volume mounted at `/data`; the SQLite database is `/data/control.sqlite3`. Ordinary container replacement and `./scripts/local.sh down` preserve the named volume. Do not remove the volume when preserving booth settings. The local hub on each Mac is independent; it is not a database replica of the laptop.

The proxy preserves the full `/control-api/...` URI, browser Host and Origin, and original HTTP/HTTPS scheme across the station-to-laptop hop. This lets the backend enforce same-origin writes while the browser uses an HttpOnly, SameSite session cookie. There is no browser bearer token or provider key in this setup.

When the selected hub is unavailable, the launchpad catches connection failures, retains its cached configuration and current demo, and retries in the background. A fresh browser without a cache uses built-in defaults. A control-hub outage does not automatically change network policy or disable cloud demos; those demos still require their own backend and internet connections. Device-only fallback edits are explicitly local to that browser; reconnecting restores the saved hub configuration. There is no automatic leader election, database replication, or silent switch to an independent station hub.

A station On setting overrides global Off. Inherit removes that station override. Policy changes affect the next launch and do not stop the current demo. Offline policy is limited by the local runtime's reported demo capabilities. It does not switch Temporal Cloud clients to OSS, emulate unavailable AI providers, or provision AWS replacements. Hosted-only apps remain unavailable offline.

## Global display defaults and station overrides

Select **All stations** to set the default demo-area width, height, horizontal and vertical position, content zoom, and Temporal UI zoom. Save once to update every station that inherits those fields.

Size or position adjustments briefly show a red outline on the current screen at the draft panel’s actual coordinates. It disappears 1.5 seconds after the last adjustment; another adjustment restarts the timer. This works for global defaults and station overrides, stays fixed while the controls scroll, and lets clicks pass through. No settings are sent until Save. A remote station applies the same settings within its own viewport.

On a station tab, changing a field creates an override for that field. **Use global** removes it and resumes following the global value. **Use global geometry** clears width, height, position, and content-zoom overrides together; it keeps that station's Temporal UI zoom choice. An explicit station override stays fixed even if it currently equals the global value.

Saved configurations from before global display settings retain non-default station values as overrides. Values that matched the original defaults now inherit. Existing demo availability and network overrides keep their current behavior.

The laptop writes settings to the shared control hub over HTTP. Each station polls that hub every two seconds and applies its effective settings; this control path does not use Temporal Workflows or Activities.

## Temporal UI zoom

On the laptop, open `/config`, unlock the controls, and select a specific Mac Mini. Under **Temporal UI zoom**, use the slider or − / percentage reset / + buttons, then **Save settings**. The range is 70–130%; reset is 100%.

On a station tab, only that station's lower workflow panel changes. The All stations tab sets the inherited default. Its demo and workflow stay open while the setting updates through the existing two-second control-hub polling. This is separate from **Content zoom**, which scales the whole demo area. The attendee screen has no zoom controls.

The setting persists with each station's configuration, including browser cache during a hub outage. Older saved configurations default to 100% without changing their geometry. Each station must already have its own station ID and use the same control hub as the laptop.

## Hosted booth

The hosted deployment is a different setup from the LAN one above: the stations' browsers load `https://reinvent-booth.tmprl-demo.cloud`, and nothing in the cloud can reach a laptop on the booth LAN (the gateway runs in EKS, and the HTTPS page cannot call an `http://` LAN address). The hub is the hosted `control-hub` component.

- **Storage.** The hosted hub keeps settings, presence and sessions in the DynamoDB table Fieldkit provisions from `spec.aws.dynamodb.tables.control` (env `CONTROL_TABLE`, hash key `pk`, TTL on `expires_at`). Settings survive restarts and every rollout of the project. Without `CONTROL_TABLE` the hub uses SQLite, as in local runs.
- **PIN-only access.** `/config` and `/control-api` bypass Fieldkit SSO so booth machines need no employee login. The hub still requires the daily date PIN to issue an HttpOnly session cookie before accepting configuration writes. Same-origin validation, PIN throttling, and session expiry remain enabled. Public route access does not permit unauthenticated configuration writes. The date PIN is a simple booth access gate, not employee identity verification.
- `CONTROL_HUB_URL` and `BOOTH_BIND_ADDRESS` apply only to local runs.

## Pause Automatic Returns on One Machine

The hourglass beside **Screensaver** pauses all 60-second return timers in that browser. When **Paused** appears, booth staff must use **Screensaver**, **Crew**, or a mission button to navigate. Tap the hourglass again to resume with a fresh 60-second interval. This choice survives a refresh and does not change other stations. Localhost timers are enabled by default again.
