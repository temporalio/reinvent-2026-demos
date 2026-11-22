# Booth station controls

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

When the selected hub is unavailable, the launchpad retains its cached configuration and current demo. Device-only fallback edits are explicitly local to that browser; reconnecting restores the saved hub configuration. There is no automatic leader election, database replication, or silent switch to an independent station hub.

A station On setting overrides global Off. Inherit removes that station override. Policy changes affect the next launch and do not stop the current demo. Offline policy is limited by the local runtime's reported demo capabilities. It does not switch Temporal Cloud clients to OSS, emulate unavailable AI providers, or provision AWS replacements. Hosted-only apps remain unavailable offline.

## Hosted deployment gate

The single Fieldkit YAML includes the control image, service, and gateway route. The inspected Fieldkit Component schema has no generic persistent-volume or database-storage field. `replicas: 1` and `disruption: never` do not make a SQLite file durable across pod replacement. No unsupported volume field is invented in the manifest.

Before using hosted configuration writes, provide an approved persistent database/volume integration through Fieldkit or keep the authoritative hub on the laptop's persistent local stack. The hosted component's database is otherwise ephemeral, and its presence in the YAML is not a persistence claim. No infrastructure is provisioned by these local scripts.
