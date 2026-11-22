# Booth control API

A small stdlib HTTP service stores demo availability, station overrides, layout, and browser presence in SQLite. It does not change OS networking, provision resources, restart demos, or store provider credentials.

Use the monorepo's local runner and same-origin `/control-api` gateway route. The container listens on port 8090 and runs as UID 10001. Mount persistent storage at `/data`; container filesystem state alone does not survive replacement.

| Variable | Default |
| --- | --- |
| `CONTROL_DB` | `/data/control.sqlite3` |
| `CONTROL_TIMEZONE` | `America/Denver` |
| `CONTROL_PORT` | `8090` |
| `CONTROL_LISTEN_ADDRESS` | `127.0.0.1` directly; `0.0.0.0` inside Docker |

`GET /healthz` and `GET /control-api/healthz` report liveness. `GET /control-api/state?station=1` records that browser's presence without increasing the settings revision. `last_seen` indicates a browser poll, not camera or worker health.

Writes require the browser's `Origin` to match the preserved `Host` and original `X-Forwarded-Proto` scheme. Every gateway hop must preserve the original client scheme. There is no CORS support. Keep this service behind the private-LAN gateway.

`POST /control-api/login` accepts `{pin: "MMDD"}` for the server's configured timezone. Successful login sets an eight-hour HttpOnly, SameSite=Strict cookie scoped to `/control-api`; HTTPS gets Secure too. PIN attempts are limited by socket peer, so a proxy can make the limit shared across stations. `POST /control-api/logout` accepts an empty object and revokes the session. Request bodies, PINs, cookies, and session tokens are never logged. SQLite stores only session-token hashes.

`PATCH /control-api/global` takes `{revision, settings}`. `PATCH /control-api/stations/1` takes `{revision, overrides?, display?, label?}`. Unknown fields/demo IDs, invalid modes, non-finite numbers, and out-of-range geometry are rejected. Demo flag `null` removes the setting; station network mode `null` removes its override. Labels contain 1–64 nonblank characters. New configs start at revision 0; no-op saves keep the revision. Stale saves return HTTP 409 with the current full state at `state`.

Global/station flags are stored separately so the client can apply an explicit station On over a global Off. Default display geometry is width 90%, height 78%, x/y 0 CSS pixels, zoom 100%. Width accepts 40–100, height 30–100, zoom 50–150, and x/y ±7680.

Run the actual HTTP and restart tests without networking:

```bash
docker build -t reinvent-control apps/booth-control
docker run --rm --network none --entrypoint python reinvent-control \
  -m unittest discover -s tests -v
```
