#!/usr/bin/env bash
# Launch the whole ship: the shared Temporal dev server, every demo, the
# Launchpad, Booth Control (on the hub) and this station's Booth Control agent.
# Ctrl-C stops everything this script started. Every flag and command is in
# usage() below (./start.sh --help); keep it in step with the parsing.
#
# Station settings (.ship/station.env, or the environment, which wins):
#   STATION_ID=1..4|laptop   BOOTH_HUB=<hub IP, .local name or URL>   BOOTH_HUB_ROLE=hub|station|auto
#   BOOTH_TEMPORAL=<host:port of the hub's Temporal, default <hub>:7233>
#   BOOTH_TEMPORAL_UI=<the hub's Temporal UI, default http://<hub>:8233>
# SHIP_ONLY_IDS=a,b limits restart-ai / restart-demos / restart-ship to those
# ids (for testing the agent without restarting the whole ship). SHIP_STATE
# moves .ship/ (tests use a scratch dir).
#
# Temporal target (which server the demos use; set booth-wide in Booth Control):
#   auto   (default) Temporal Cloud when .ship/temporal-cloud.env is valid, the station is
#          online and a DescribeNamespace with the key works; otherwise the fallback: the hub
#          laptop's Temporal on a station, this machine's own on the hub laptop
#   local  this machine's dev server :7233, namespace default
#   hub    the hub laptop's dev server, namespace station-<STATION_ID> (and station-<id>-<ns>
#          for the multi-namespace Nexus demos), so stations never share queues or ids
#   cloud  Temporal Cloud from .ship/temporal-cloud.env (never committed). Every station
#          shares the same namespaces: {demo} in a value becomes the demo's id (one namespace
#          per demo), {station} the station id. Checked first; if the check fails, the demos
#          go to the fallback. See booth-control/README.md and aws-infra/temporal-cloud/.
# The requested target is kept in .ship/temporal_request, what the demos use in
# .ship/temporal_target. The local dev server always runs (DB .ship/temporal.db),
# whatever the target, with a watchdog, so a switch to it is instant.
# Triage Queue and Beam Aboard always use their own private dev servers (7405, 7709).
# SHIP_TEMPORAL_PORT / SHIP_TEMPORAL_UI_PORT move the local dev server (test rigs only).
#
# Demos that are already running (their web port answers) are left alone and
# not stopped on exit. Processes are only ever stopped by recorded PID/PGID.
set -uo pipefail

usage() {
  cat <<'EOF'
Usage: ./start.sh [options]        start the ship; Ctrl-C stops what it started
       ./start.sh <command> [args]

With no options: everything on this machine. The local Temporal dev server
(:7233, UI :8233), every demo, the Launchpad (:5100) and Booth Control as the
hub (:5090, API :8090), unless this machine was set up as a station.

Options (combine freely; --station and --hub are remembered in .ship/station.env):
  --station <id>       this machine's station id: 1, 2, 3, 4 (Holodeck) or laptop
  --hub <addr>         the Booth Control hub: laptop IP, name.local or URL. If the
                       ship is already running, switches it over instead
  --temporal <t>       demos use Temporal auto | local | hub | cloud (until the hub says
                       otherwise). Default auto: Cloud if .ship/temporal-cloud.env works
  --offline            AI demos in offline mock mode
  --online             AI demos pick their own provider (skips the OpenAI key check)
  --only <a,b>         start only these demo ids (plus the Launchpad and Booth Control)
  --skip <a,b>         start everything except these demo ids
  --no-open            don't open the Launchpad in the browser
  -h, --help           this help

Commands:
  status                    what's up, and which Temporal the demos use (and why)
  list                      demo ids, ports and folders
  stop                      stop everything a previous run started (by recorded PIDs)
  temporal [demo]           which Temporal the demos use, and the env they get (no secrets)
  cloud-check               check .ship/temporal-cloud.env: DescribeNamespace on every
                            namespace in it, with its key (the key is never printed)
  restart-temporal          restart this machine's local Temporal dev server (by recorded PGID)
  check-hub [addr]          can this machine reach the hub (API, Temporal, UI)?
  set-hub <addr>            point this machine at a new hub (restarts its agent)
  set-hub-all <addr>        tell every station the hub's new address (through the hub)
  start-demo <id>           start one demo
  stop-demo <id>            stop one demo
  restart-demo <id>         restart one demo
  restart-demos             restart every demo (not the Launchpad or Booth Control)
  restart-ship              restart every demo and the Launchpad
  restart-ai online|offline restart the AI demos in that mode
  set-temporal auto|local|hub|cloud [online|offline]
                            move the demos to that Temporal (and AI mode), restart them
  restart-temporal-demos    restart the demos that follow the Temporal target
  The restart commands act only on demos this ship started (recorded PIDs).
  Booth Control's station agent uses them too.

Common cases:
  Everything on this laptop          ./start.sh
  Hub laptop at the booth, 1st time  ./start.sh --station laptop --hub localhost
  Mac mini N, first time             ./start.sh --station N --hub <laptop IP or name.local>
                                     (remembered: after that, just ./start.sh)
  Point a mini at a new laptop IP    ./start.sh set-hub <ip>         (on that mini)
                                     ./start.sh set-hub-all <ip>     (every mini, from the hub)
  Can this mini reach the hub?       ./start.sh check-hub
  Run offline                        ./start.sh --offline
  Turn on Temporal Cloud             aws-infra/temporal-cloud/README.md, then ./start.sh cloud-check
  Run only one demo                  ./start.sh --only holodeck      (ids: ./start.sh list)
  Restart one demo / everything      ./start.sh restart-demo holodeck / ./start.sh restart-ship
  Stop everything                    Ctrl-C in the ship's terminal, or ./start.sh stop
  Logs                               .ship/logs/<id>.log, temporal.log, station-agent.log
                                     (local Temporal restarts: .ship/temporal-restarts.log)

More: launchpad/README.md, booth-control/README.md (hub, stations, Temporal target).
EOF
}
bad_usage() { echo "start.sh: $1" >&2; echo "See ./start.sh --help" >&2; exit 2; }
# Help first, before anything is saved or started (even after other flags).
[ "${1:-}" = help ] && { usage; exit 0; }
for a in "$@"; do case "$a" in -h|--help) usage; exit 0 ;; esac; done

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
STATE="${SHIP_STATE:-$ROOT/.ship}"   # SHIP_STATE: tests use a scratch dir
LOGS="$STATE/logs"
PIDS="$STATE/pids"
mkdir -p "$LOGS" "$PIDS"

# id | folder (relative to ROOT) | web port | command | uses AI | Temporal
# Temporal: follow = uses the Temporal target (local / hub / cloud); own = its own
# private dev server, always local; none = not a demo (Launchpad, Booth Control).
# booth-control (the hub) runs only on the hub machine; see BOOTH_HUB_ROLE.
DEMOS=(
  "booth-control|booth-control|5090|./start.sh|no|none"
  "launchpad|launchpad|5100|npm run dev|no|none"
  "keep-business-moving|demos/bridge/keep-business-moving|5201|./start.sh|no|follow"
  "space-tacos|demos/engineering/space-tacos|5301|env SPACE_TACOS_NO_DOCKER=1 ./scripts/start.sh python|no|follow"
  "ships-log|demos/engineering/ships-log|5305|./start.sh|no|follow"
  "interstellar-nexus|demos/engineering/interstellar-nexus|5306|./start.sh|no|follow"
  "galactic-credits|demos/engineering/galactic-credits|5302|./start.sh --local|no|follow"
  "shore-leave|demos/engineering/shore-leave|5303|./start.sh|yes|follow"
  "cargo-pipeline|demos/engineering/cargo-pipeline|5304|./start.sh|no|follow"
  "reactor-breach|demos/sickbay/reactor-breach|5401|./start.sh|no|follow"
  "airlock|demos/sickbay/airlock|5402|./start.sh|yes|follow"
  "proxy-authority|demos/sickbay/proxy-authority|5403|./start.sh|yes|follow"
  "shuttle-refit|demos/sickbay/shuttle-refit|5404|./start.sh|no|follow"
  "triage-queue|demos/sickbay/triage-queue|5405|./start.sh|no|own"
  "security-clearance|demos/sickbay/security-clearance|5406|./start.sh|no|follow"
  "holo-gallery|demos/arboretum/holo-gallery|5501|./start.sh|yes|follow"
  "beacon-campaign|demos/arboretum/beacon-campaign|5502|./start.sh|yes|follow"
  "ad-studio|demos/arboretum/ad-studio|5503|./start.sh|yes|follow"
  "launch-countdown|demos/arboretum/launch-countdown|5504|./start.sh|yes|follow"
  "crew-journeys|demos/arboretum/crew-journeys|5505|./start.sh|no|follow"
  "signal-archive|demos/arboretum/signal-archive|5506|./start.sh|yes|follow"
  "holodeck|demos/holodeck/app|5600|./start.sh|yes|follow"
  "beam-aboard|demos/transporter/beam-aboard|5701|./start.sh|no|own"
  "starbase-treasury|demos/transporter/starbase-treasury|5703|./start.sh|yes|follow"
  "colony-loan|demos/transporter/colony-loan|5704|./start.sh|yes|follow"
  "transporter-lock|demos/transporter/transporter-lock|5705|./start.sh|yes|follow"
  "interstellar-arbitration|demos/transporter/interstellar-arbitration|5706|./start.sh|yes|follow"
)

field() { echo "$1" | cut -d'|' -f"$2"; }
# Vite often listens on ::1 only (macOS "localhost"), so check IPv4 and IPv6.
up() { nc -z 127.0.0.1 "$1" 2>/dev/null || nc -z ::1 "$1" 2>/dev/null; }
row() { local d; for d in "${DEMOS[@]}"; do [ "$(field "$d" 1)" = "$1" ] && { echo "$d"; return 0; }; done; return 1; }

# A process and all of its descendants, children last.
tree() {
  local pid="$1" kid
  echo "$pid"
  for kid in $(pgrep -P "$pid" 2>/dev/null); do tree "$kid"; done
}

# ── Station settings ─────────────────────────────────────────────────────
# .ship/station.env holds KEY=value lines; values already in the environment win.
STATION_ENV="$STATE/station.env"
load_station_env() {
  [ -f "$STATION_ENV" ] || return 0
  local k v
  while IFS='=' read -r k v; do
    k="${k// /}"
    case "$k" in
      STATION_ID|BOOTH_HUB|BOOTH_HUB_ROLE|BOOTH_TEMPORAL|BOOTH_TEMPORAL_UI)
        v="${v%%#*}"; v="${v%"${v##*[![:space:]]}"}"; v="${v#\"}"; v="${v%\"}"
        [ -z "${!k:-}" ] && export "$k=$v" ;;
    esac
  done < "$STATION_ENV"
}
save_station_env() {  # key [value]  (no value: remove the key)
  touch "$STATION_ENV"
  grep -v "^$1=" "$STATION_ENV" > "$STATION_ENV.tmp" || true
  [ $# -ge 2 ] && echo "$1=$2" >> "$STATION_ENV.tmp"
  mv "$STATION_ENV.tmp" "$STATION_ENV"
}
load_station_env

STATION_ID="${STATION_ID:-laptop}"
BOOTH_HUB="${BOOTH_HUB:-localhost}"
# Accept a bare IP or hostname: 10.0.0.5 -> http://10.0.0.5:8090
normalize_hub() {
  local h="$1"
  case "$h" in *://*) ;; *) h="http://$h" ;; esac
  h="${h%/}"
  local hostport="${h#*://}"
  case "$hostport" in *:*) ;; *) h="$h:8090" ;; esac
  echo "$h"
}
# A .local (mDNS) name -> its IPv4 address, so demos and gRPC never try the
# laptop's IPv6 link-local address. Anything else passes through unchanged.
resolve_host() {
  local h="$1" ip=""
  case "$h" in
    *.local)
      ip=$(dscacheutil -q host -a name "$h" 2>/dev/null | awk '/^ip_address:/ && $2 ~ /^[0-9.]+$/ {print $2; exit}')
      [ -n "$ip" ] || ip=$(python3 -c 'import socket,sys; print(socket.gethostbyname(sys.argv[1]))' "$h" 2>/dev/null)
      echo "${ip:-$h}" ;;
    *) echo "$h" ;;
  esac
}
set_hub_vars() {  # from BOOTH_HUB: HUB_URL (API), HUB_HOST, the hub's Temporal and its UI
  HUB_URL="$(normalize_hub "$BOOTH_HUB")"
  HUB_HOST="${HUB_URL#*://}"; HUB_HOST="${HUB_HOST%:*}"
  HUB_IP="$(resolve_host "$HUB_HOST")"
  # BOOTH_HUB_TEMPORAL_PORT / BOOTH_HUB_UI_PORT: only for test rigs with a second "hub" on one machine.
  HUB_TEMPORAL="${BOOTH_TEMPORAL:-$HUB_IP:${BOOTH_HUB_TEMPORAL_PORT:-7233}}"
  HUB_TEMPORAL_UI="${BOOTH_TEMPORAL_UI:-http://$HUB_IP:${BOOTH_HUB_UI_PORT:-8233}}"
}
set_hub_vars

# hub: this machine runs Booth Control. auto: hub when BOOTH_HUB points at this machine.
hub_role() {
  case "${BOOTH_HUB_ROLE:-auto}" in
    hub) echo hub; return ;;
    station) echo station; return ;;
  esac
  local h; h=$(echo "$HUB_HOST" | tr '[:upper:]' '[:lower:]')
  case "$h" in
    localhost|127.0.0.1|::1) echo hub; return ;;
    "$(hostname | tr '[:upper:]' '[:lower:]')"|"$(hostname -s | tr '[:upper:]' '[:lower:]').local") echo hub; return ;;
    "$(scutil --get LocalHostName 2>/dev/null | tr '[:upper:]' '[:lower:]').local") echo hub; return ;;
  esac
  if ifconfig 2>/dev/null | grep -q "inet $HUB_IP "; then echo hub; else echo station; fi
}
ROLE="$(hub_role)"

# ── Temporal target: which server the demos use ──────────────────────────
# .ship/temporal_target: what the demos use now (local | hub | cloud).
# .ship/temporal_request: what was asked for (auto | local | hub | cloud; default auto).
TARGET_FILE="$STATE/temporal_target"
REQUEST_FILE="$STATE/temporal_request"
CLOUD_ENV="$STATE/temporal-cloud.env"
CLOUD_STATUS="$STATE/cloud-status.json"
TEMPORAL_RESTARTS="$STATE/temporal-restarts.log"
# This machine's own dev server (always running). Test rigs move it with SHIP_TEMPORAL_PORT.
LOCAL_TEMPORAL_PORT="${SHIP_TEMPORAL_PORT:-7233}"
LOCAL_TEMPORAL_UI_PORT="${SHIP_TEMPORAL_UI_PORT:-8233}"
current_target() { local t; t=$(cat "$TARGET_FILE" 2>/dev/null); case "$t" in hub|cloud) echo "$t" ;; *) echo local ;; esac; }
current_request() { local t; t=$(cat "$REQUEST_FILE" 2>/dev/null); case "$t" in local|hub|cloud) echo "$t" ;; *) echo auto ;; esac; }
TEMPORAL_TARGET="$(current_target)"
STATION_NS="station-$(echo "$STATION_ID" | tr '[:upper:]' '[:lower:]')"
# Every variable a demo reads to find Temporal. A "follow" demo gets these
# cleared, then set for the target, so nothing leaks in from the shell.
TEMPORAL_VARS=(
  TEMPORAL_ADDRESS TEMPORAL_ENDPOINT TEMPORAL_NAMESPACE TEMPORAL_API_KEY TEMPORAL_TLS
  TEMPORAL_UI_URL TEMPORAL_UI_BASE TEMPORAL_CERT_PATH TEMPORAL_KEY_PATH
  TEMPORAL_TLS_CLIENT_CERT_PATH TEMPORAL_TLS_CLIENT_KEY_PATH TEMPORAL_PROFILE TEMPORAL_CONFIG_FILE
  GALLEY_NAMESPACE CARGO_NAMESPACE NEXUS_ENDPOINT
  FREIGHT_NAMESPACE STARPORT_NAMESPACE INSURANCE_NAMESPACE FREIGHT_ENDPOINT STARPORT_ENDPOINT INSURANCE_ENDPOINT
  BRIDGE_NAMESPACE TRANSPORTER_NAMESPACE GATEWAY_NEXUS_ENDPOINT BRIDGE_NEXUS_ENDPOINT
)
cloud_ready() {  # the cloud env file has at least an address, a namespace and an API key (shape only)
  [ -f "$CLOUD_ENV" ] && grep -q '^TEMPORAL_ADDRESS=.' "$CLOUD_ENV" && grep -q '^TEMPORAL_NAMESPACE=.' "$CLOUD_ENV" \
    && grep -q '^TEMPORAL_API_KEY=.' "$CLOUD_ENV"
}
cloud_value() {  # KEY -> its value from the cloud env, {station} filled in, {demo} shown as * (never the API key)
  local v; v=$(grep -E "^$1=" "$CLOUD_ENV" 2>/dev/null | tail -1 | cut -d= -f2-)
  v="${v%\"}"; v="${v#\"}"; v="${v//\{station\}/$STATION_ID}"; echo "${v//\{demo\}/*}"
}
# Fills TENV with `env` arguments for a demo that follows the target $1.
temporal_env() {  # target [demo id]
  local target="$1" demo="${2:-}" v ns="$STATION_NS" h="${HUB_TEMPORAL%:*}"
  TENV=()
  for v in "${TEMPORAL_VARS[@]}"; do TENV+=(-u "$v"); done
  case "$target" in
    hub)
      TENV+=("TEMPORAL_ADDRESS=$HUB_TEMPORAL" "TEMPORAL_NAMESPACE=$ns"
        "TEMPORAL_UI_URL=$HUB_TEMPORAL_UI" "TEMPORAL_UI_BASE=$HUB_TEMPORAL_UI/namespaces/$ns"
        # Multi-namespace (Nexus) demos: one namespace per team, prefixed per station,
        # and Nexus endpoints (cluster-wide names) prefixed the same way.
        "GALLEY_NAMESPACE=$ns-galley" "CARGO_NAMESPACE=$ns-cargo" "NEXUS_ENDPOINT=$ns-interstellar-nexus-cargo"
        "FREIGHT_NAMESPACE=$ns-arbitration-freight" "STARPORT_NAMESPACE=$ns-arbitration-starport"
        "INSURANCE_NAMESPACE=$ns-arbitration-insurance" "FREIGHT_ENDPOINT=$ns-arbitration-freight-treasury"
        "STARPORT_ENDPOINT=$ns-arbitration-starport-evidence" "INSURANCE_ENDPOINT=$ns-arbitration-insurance-claims"
        "BRIDGE_NAMESPACE=$ns-bridge-ops" "TRANSPORTER_NAMESPACE=$ns-transporter-room"
        "GATEWAY_NEXUS_ENDPOINT=$ns-transporter-lock-gateway" "BRIDGE_NEXUS_ENDPOINT=$ns-transporter-lock-bridge") ;;
    cloud)
      # KEY=value lines only (never sourced). Every station shares these namespaces:
      # {demo} becomes the demo's id (one namespace per demo), {station} this
      # station's id. CLOUD_* lines are for ship.sh and the agent, not the demos.
      local k val have_ui=0 cns=""
      while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]] || continue
        k="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
        case "$k" in CLOUD_*) continue ;; esac
        val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
        val="${val//\{station\}/$STATION_ID}"; val="${val//\{demo\}/${demo:-default}}"
        [ "$k" = TEMPORAL_UI_URL ] && have_ui=1
        [ "$k" = TEMPORAL_NAMESPACE ] && cns="$val"
        TENV+=("$k=$val")
      done < "$CLOUD_ENV"
      [ $have_ui = 1 ] || TENV+=("TEMPORAL_UI_URL=https://cloud.temporal.io")
      [ -n "$cns" ] && TENV+=("TEMPORAL_UI_BASE=https://cloud.temporal.io/namespaces/$cns") ;;
  esac
  return 0
}

# The station agent's CLI (the Temporal checks and the Cloud check live in Python).
agent_cli() {
  (cd "$ROOT/booth-control" && STATION_ID="$STATION_ID" BOOTH_HUB="$HUB_URL" BOOTH_TEMPORAL="$HUB_TEMPORAL" \
    BOOTH_HUB_ROLE_RESOLVED="$ROLE" BOOTH_AGENT_STATE="$STATE" SHIP_TEMPORAL_PORT="$LOCAL_TEMPORAL_PORT" \
    uv run --quiet booth-station-agent "$@")
}
# Resolve a requested target (auto | local | hub | cloud) for network mode $2:
# sets RESOLVED and RESOLVE_NOTE. Runs the Cloud check (DescribeNamespace with the
# key) when Cloud is a candidate; falls back without it if the agent can't run.
resolve_target() {  # request network
  local out k v
  RESOLVED=""; RESOLVE_NOTE=""
  out=$(agent_cli resolve-target "$1" "${2:-online}" 2>/dev/null)
  while IFS='=' read -r k v; do
    case "$k" in TARGET) RESOLVED="$v" ;; NOTE) RESOLVE_NOTE="$v" ;; esac
  done <<< "$out"
  case "$RESOLVED" in local|hub|cloud) ;; *)
    RESOLVED=$([ "$ROLE" = hub ] && echo local || echo hub)
    case "$1" in local|hub) RESOLVED="$1" ;; esac
    RESOLVE_NOTE="couldn't run the Temporal check (booth-control's uv env); using $RESOLVED" ;;
  esac
}
# One line about the last Cloud check (.ship/cloud-status.json, written by the agent).
cloud_status_line() {
  [ -f "$CLOUD_STATUS" ] || { echo "not checked yet"; return; }
  python3 -c 'import json,sys,time
s=json.load(open(sys.argv[1])); age=int(time.time()-s.get("checked_at",0))
print(("ok" if s.get("ok") else "FAILED: "+s.get("detail","")) + " (%ss ago)" % age)' "$CLOUD_STATUS" 2>/dev/null || echo "unreadable"
}

cmd_list() {
  # id, port, folder, Temporal (follow | own | none); the station agent reads these columns.
  for d in "${DEMOS[@]}"; do printf "  %-24s :%-5s  %-46s %s\n" "$(field "$d" 1)" "$(field "$d" 3)" "$(field "$d" 2)" "$(field "$d" 6)"; done
}

cmd_status() {
  local lt="$(up "$LOCAL_TEMPORAL_PORT" && echo up || echo down)   UI http://localhost:$LOCAL_TEMPORAL_UI_PORT"
  if [ -f "$TEMPORAL_RESTARTS" ]; then lt="$lt · restarted $(wc -l < "$TEMPORAL_RESTARTS" | tr -d ' ')x, last $(tail -1 "$TEMPORAL_RESTARTS" | cut -d' ' -f1-2)"; fi
  printf "  %-24s %-6s %s\n" "Temporal" ":$LOCAL_TEMPORAL_PORT" "$lt"
  local where=""
  case "$TEMPORAL_TARGET" in
    hub) where=" ($HUB_TEMPORAL, namespace $STATION_NS)" ;;
    cloud) where=" (Temporal Cloud, namespace $(cloud_value TEMPORAL_NAMESPACE))" ;;
    local) where=" (this machine's dev server)" ;;
  esac
  printf "  %-24s %s\n" "Demos' Temporal" "$TEMPORAL_TARGET$where · requested $(current_request)"
  printf "  %-24s %s\n" "Temporal Cloud" "$(cloud_ready && echo "settings present (.ship/temporal-cloud.env) · last check $(cloud_status_line)" || echo "no settings (.ship/temporal-cloud.env)")"
  for d in "${DEMOS[@]}"; do
    local id port; id=$(field "$d" 1); port=$(field "$d" 3)
    [ "$id" = booth-control ] && [ "$ROLE" != hub ] && continue
    printf "  %-24s %-6s %s\n" "$id" ":$port" "$(up "$port" && echo "up     http://localhost:$port" || echo down)"
  done
}

# Stop what we launched for an id: the whole process group when job control
# gave it one, otherwise the process tree. Each demo's own start.sh gets TERM
# first so it can clean up after itself.
stop_group() {
  local id="$1" file="$PIDS/$1.pgid" pid procs p
  [ -f "$file" ] || return 0
  pid=$(cat "$file")
  rm -f "$file"
  kill -0 "$pid" 2>/dev/null || return 0
  if [ "$(ps -o pgid= -p "$pid" | tr -d ' ')" = "$pid" ]; then
    kill -TERM -- "-$pid" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 -- "-$pid" 2>/dev/null || break; sleep 0.25; done
    kill -KILL -- "-$pid" 2>/dev/null
  else
    procs=$(tree "$pid")
    kill -TERM "$pid" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    for p in $procs; do kill -TERM "$p" 2>/dev/null; done
    sleep 1
    for p in $procs; do kill -KILL "$p" 2>/dev/null; done
  fi
  echo "  stopped $id"
}

cmd_stop() {
  stop_group station-agent
  for d in "${DEMOS[@]}"; do stop_group "$(field "$d" 1)"; done
  stop_group temporal
}

# AI mode: auto (decide below), online, offline. Set from flags, or by the agent's subcommands.
AI_MODE=auto

launch() {  # id dir cmd uses_ai temporal
  local id="$1" dir="$ROOT/$2" cmd="$3" ai="$4" tmp="${5:-follow}"
  if [ ! -d "$dir" ]; then echo "  skip $id: $2 not found"; return; fi
  # `env` takes every -u before the first NAME=value.
  local args=() offline=0
  [ "$ai" = yes ] && [ "$AI_MODE" = offline ] && offline=1
  [ $offline = 1 ] && args+=(-u OPENAI_API_KEY)
  if [ "$tmp" = follow ]; then temporal_env "$TEMPORAL_TARGET" "$id"; args+=("${TENV[@]}"); fi
  [ $offline = 1 ] && args+=(AI_PROVIDER=mock)
  (
    cd "$dir" || exit 1
    exec env ${args[@]+"${args[@]}"} bash -c "exec $cmd" </dev/null
  ) >"$LOGS/$id.log" 2>&1 &
  echo "$!" >"$PIDS/$id.pgid"
  STARTED+=("$id")
  echo "  starting $id (log: .ship/logs/$id.log)"
}

# ── Subcommands for the station agent (one demo or a set, by recorded PID) ──
STARTED=()
current_ai_mode() { local m; m=$(cat "$STATE/ai_mode" 2>/dev/null); echo "${m:-online}"; }
# Restart ids that this ship started (they have a pgid file); stop them all first, in parallel.
restart_ids() {  # ids...
  local id
  for id in "$@"; do stop_group "$id" & done
  wait
  set -m
  for id in "$@"; do
    local d; d=$(row "$id") || continue
    launch "$id" "$(field "$d" 2)" "$(field "$d" 4)" "$(field "$d" 5)" "$(field "$d" 6)"
  done
  echo "${STARTED[*]:-}" | tr ' ' '\n' >> "$STATE/adopted"
}
# The demos this ship started that follow the Temporal target (and are allowed by SHIP_ONLY_IDS).
follow_ids() {
  local d id
  for d in "${DEMOS[@]}"; do
    id=$(field "$d" 1)
    [ "$(field "$d" 6)" = follow ] && allowed "$id" && had_pgid "$id" && echo "$id"
  done
  return 0
}
# The station agent (a Temporal worker on booth-station-<id>), in its own process group.
start_agent() {
  set -m
  (
    cd "$ROOT/booth-control" || exit 1
    # SHIP_STATE / SHIP_TEMPORAL_PORT: the agent's own ship.sh calls use the same state and port.
    exec env STATION_ID="$STATION_ID" BOOTH_HUB="$HUB_URL" BOOTH_TEMPORAL="$HUB_TEMPORAL" \
      BOOTH_HUB_ROLE_RESOLVED="$ROLE" BOOTH_AGENT_STATE="$STATE" SHIP_STATE="$STATE" \
      SHIP_TEMPORAL_PORT="$LOCAL_TEMPORAL_PORT" SHIP_TEMPORAL_UI_PORT="$LOCAL_TEMPORAL_UI_PORT" \
      uv run --quiet booth-station-agent </dev/null
  ) >>"$LOGS/station-agent.log" 2>&1 &
  echo "$!" >"$PIDS/station-agent.pgid"
  STARTED+=("station-agent")
  echo "  starting station agent for station $STATION_ID (log: .ship/logs/station-agent.log)"
}
tcp_ok() { nc -z -G 2 "${1%:*}" "${1##*:}" 2>/dev/null; }  # host:port
http_ok() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1")" = 200 ]; }
check_hub() {  # print what this machine can reach; returns 1 if the API or Temporal is down
  local rc=0
  printf "  %-26s %s\n" "Hub" "$HUB_URL$([ "$HUB_IP" != "$HUB_HOST" ] && echo " ($HUB_HOST -> $HUB_IP)")"
  # By IP (a .local name was resolved above), so a slow mDNS lookup can't time it out.
  local api="${HUB_URL%%://*}://$HUB_IP:${HUB_URL##*:}"
  if http_ok "$api/api/health"; then printf "  %-26s ok\n" "Booth Control API"; else printf "  %-26s UNREACHABLE\n" "Booth Control API"; rc=1; fi
  if tcp_ok "$HUB_TEMPORAL"; then printf "  %-26s ok\n" "Temporal $HUB_TEMPORAL"; else printf "  %-26s UNREACHABLE\n" "Temporal $HUB_TEMPORAL"; rc=1; fi
  if http_ok "$HUB_TEMPORAL_UI"; then printf "  %-26s ok\n" "Temporal UI"; else printf "  %-26s unreachable (only the UI links need it)\n" "Temporal UI"; fi
  return $rc
}
# Point this machine at a new hub: save it, restart the agent, and restart the
# demos if they run on the hub's Temporal (their address changes).
set_hub() {  # addr
  local addr="$1"
  BOOTH_HUB="$addr"; unset BOOTH_TEMPORAL BOOTH_TEMPORAL_UI; set_hub_vars; ROLE="$(hub_role)"
  save_station_env BOOTH_HUB "$addr"; save_station_env BOOTH_TEMPORAL; save_station_env BOOTH_TEMPORAL_UI
  echo "Booth Control hub: $HUB_URL (saved in .ship/station.env)"
  check_hub || echo "  (saved anyway; the agent keeps retrying until the hub answers)"
  if had_pgid station-agent; then stop_group station-agent; start_agent; echo station-agent >> "$STATE/adopted"; fi
  if [ "$(current_target)" = hub ]; then
    local ids; ids=$(follow_ids | tr '\n' ' ')
    AI_MODE=$(current_ai_mode)
    [ -n "$ids" ] && restart_ids $ids
    echo "restarted on the new hub's Temporal: ${ids:-nothing}"
  fi
}
had_pgid() { [ -f "$PIDS/$1.pgid" ] && kill -0 "$(cat "$PIDS/$1.pgid")" 2>/dev/null; }
allowed() { [ -z "${SHIP_ONLY_IDS:-}" ] || [[ ",$SHIP_ONLY_IDS," == *",$1,"* ]]; }

# ── This machine's Temporal dev server (always running, whatever the target) ──
# On the hub it listens on the LAN (gRPC and UI), so station agents reach the
# "booth" namespace (the fleet control plane) and, with the "hub" Temporal
# target, each station's demos use their own station-<id> namespace on it.
# Elsewhere it's local only. It always runs, so falling back to it is instant.
# Its database is .ship/temporal.db, so workflows survive a restart.
# The dev server picks random free ports for its internal services. With two
# dozen demo workers retrying connections, one of those ports is sometimes taken
# by the time it binds and the server crashes ("bind: address already in use").
# So start it with retries, and keep a watchdog on it: the ship's foreground loop
# (below), or the station agent when that loop isn't running (restart-temporal).
start_temporal() {
  TEMPORAL_ARGS=(--db-filename "$STATE/temporal.db" --log-level warn
    --port "$LOCAL_TEMPORAL_PORT" --ui-port "$LOCAL_TEMPORAL_UI_PORT")
  if [ "$ROLE" = hub ]; then
    TEMPORAL_ARGS+=(--ip 0.0.0.0 --ui-ip 0.0.0.0 --namespace booth)
    for sid in 1 2 3 4 laptop; do TEMPORAL_ARGS+=(--namespace "station-$sid"); done
  fi
  local attempt
  set -m   # its own process group, recorded in .ship/pids/temporal.pgid
  for attempt in 1 2 3 4 5; do
    temporal server start-dev "${TEMPORAL_ARGS[@]}" >>"$LOGS/temporal.log" 2>&1 </dev/null &
    echo "$!" >"$PIDS/temporal.pgid"
    for _ in $(seq 1 40); do up "$LOCAL_TEMPORAL_PORT" && break; sleep 0.5; done
    # Up, and still up a few seconds later (the crash comes just after start).
    if up "$LOCAL_TEMPORAL_PORT"; then sleep 3; up "$LOCAL_TEMPORAL_PORT" && return 0; fi
    echo "  Temporal didn't stay up (attempt $attempt); retrying"
    stop_group temporal
    sleep 1
  done
  return 1
}
# One restarter at a time (the ship's loop and the agent's restart-temporal).
# mkdir is atomic; a lock older than 3 minutes is left over from a crash.
temporal_lock() {
  local lock="$STATE/temporal.lock"
  if mkdir "$lock" 2>/dev/null; then return 0; fi
  if [ -n "$(find "$lock" -maxdepth 0 -mmin +3 2>/dev/null)" ]; then rm -rf "$lock"; mkdir "$lock" 2>/dev/null && return 0; fi
  return 1
}
temporal_unlock() { rm -rf "$STATE/temporal.lock"; }
# Restart the local dev server (only ever the one we recorded). $1 says who asked.
restart_local_temporal() {  # who
  temporal_lock || { echo "  another restart of local Temporal is in progress"; return 2; }
  echo "$(date '+%Y-%m-%d %H:%M:%S') restarted by $1" >> "$TEMPORAL_RESTARTS"
  stop_group temporal
  local rc=0
  start_temporal || rc=1
  temporal_unlock
  return $rc
}

case "${1:-}" in
  list) cmd_list; exit 0 ;;
  status) cmd_status; exit 0 ;;
  stop) cmd_stop; exit 0 ;;
  restart-ai)
    mode="${2:-}"; [ "$mode" = online ] || [ "$mode" = offline ] || { echo "usage: ship.sh restart-ai online|offline"; exit 2; }
    AI_MODE="$mode"
    ids=()
    for d in "${DEMOS[@]}"; do
      id=$(field "$d" 1)
      [ "$(field "$d" 5)" = yes ] && allowed "$id" && had_pgid "$id" && ids+=("$id")
    done
    echo "$mode" > "$STATE/ai_mode"; echo "$mode" > "$STATE/network_mode"
    [ ${#ids[@]} -gt 0 ] && restart_ids "${ids[@]}"
    echo "AI demos now $mode: ${ids[*]:-none running}"
    exit 0 ;;
  stop-demo)
    row "${2:-}" >/dev/null || { echo "unknown demo: ${2:-}"; exit 2; }
    stop_group "$2"; exit 0 ;;
  start-demo|restart-demo)
    d=$(row "${2:-}") || { echo "unknown demo: ${2:-}"; exit 2; }
    AI_MODE=$(current_ai_mode)
    if [ "$1" = start-demo ] && up "$(field "$d" 3)"; then echo "  $2 already running"; exit 0; fi
    if [ "$1" = restart-demo ] && ! had_pgid "$2" && up "$(field "$d" 3)"; then
      echo "$2 wasn't started by this ship (no recorded PID), so it's left alone"; exit 1
    fi
    restart_ids "$2"; exit 0 ;;
  restart-demos|restart-ship)
    AI_MODE=$(current_ai_mode)
    ids=()
    for d in "${DEMOS[@]}"; do
      id=$(field "$d" 1)
      case "$id" in booth-control) continue ;; launchpad) [ "$1" = restart-ship ] || continue ;; esac
      allowed "$id" && had_pgid "$id" && ids+=("$id")
    done
    [ ${#ids[@]} -gt 0 ] && restart_ids "${ids[@]}"
    echo "restarted: ${ids[*]:-nothing (no demos with recorded PIDs)}"
    exit 0 ;;
  set-temporal)
    # The station agent calls this with a resolved target once it has checked it
    # (and saves the request itself). By hand, auto (or cloud) is resolved here first.
    target="${2:-}"; mode="${3:-}"
    case "$target" in auto|local|hub|cloud) ;; *) echo "usage: ship.sh set-temporal auto|local|hub|cloud [online|offline]"; exit 2 ;; esac
    case "$mode" in online|offline) echo "$mode" > "$STATE/ai_mode"; echo "$mode" > "$STATE/network_mode" ;; "") ;; *) echo "bad mode: $mode"; exit 2 ;; esac
    if [ "${SHIP_RESOLVED:-}" != 1 ]; then
      echo "$target" > "$REQUEST_FILE"
      if [ "$target" = auto ] || [ "$target" = cloud ]; then
        net=$(cat "$STATE/network_mode" 2>/dev/null); resolve_target "$target" "${net:-online}"
        echo "$target -> $RESOLVED${RESOLVE_NOTE:+ ($RESOLVE_NOTE)}"
        target="$RESOLVED"
      fi
    fi
    if [ "$target" = cloud ] && ! cloud_ready; then echo "no Temporal Cloud settings in .ship/temporal-cloud.env"; exit 1; fi
    echo "$target" > "$TARGET_FILE"; TEMPORAL_TARGET="$target"
    AI_MODE=$(current_ai_mode)
    ids=$(follow_ids | tr '\n' ' ')
    # A changed AI mode also restarts the AI demos that don't follow the target (none today).
    if [ -n "$mode" ]; then
      for d in "${DEMOS[@]}"; do
        id=$(field "$d" 1)
        [ "$(field "$d" 5)" = yes ] && [ "$(field "$d" 6)" != follow ] && allowed "$id" && had_pgid "$id" && ids="$ids $id"
      done
    fi
    [ -n "${ids// /}" ] && restart_ids $ids
    echo "demos now on Temporal $target${mode:+, AI $mode}: ${ids:-none running}"
    exit 0 ;;
  restart-temporal)
    # Only the local dev server this ship recorded (.ship/pids/temporal.pgid); never by name.
    if ! had_pgid temporal && up "$LOCAL_TEMPORAL_PORT"; then
      echo "Temporal on :$LOCAL_TEMPORAL_PORT wasn't started by this ship (no recorded PGID), so it's left alone"; exit 1
    fi
    restart_local_temporal "${SHIP_RESTART_BY:-hand}"; rc=$?
    [ $rc = 2 ] && exit 0
    echo temporal >> "$STATE/adopted"   # a running ship stops it on Ctrl-C
    if [ $rc = 0 ]; then echo "local Temporal restarted on :$LOCAL_TEMPORAL_PORT (UI :$LOCAL_TEMPORAL_UI_PORT)"; exit 0; fi
    echo "local Temporal won't start; see .ship/logs/temporal.log"; exit 1 ;;
  cloud-check)
    # Every namespace in .ship/temporal-cloud.env, with its key; prints no secrets.
    agent_cli cloud-check; exit $? ;;
  restart-temporal-demos)
    AI_MODE=$(current_ai_mode)
    ids=$(follow_ids | tr '\n' ' ')
    [ -n "${ids// /}" ] && restart_ids $ids
    echo "restarted on Temporal $TEMPORAL_TARGET: ${ids:-nothing}"
    exit 0 ;;
  temporal)
    echo "  Station $STATION_ID · demos use Temporal: $TEMPORAL_TARGET (requested: $(current_request))"
    temporal_env "$TEMPORAL_TARGET" "${2:-{demo\}}"
    for a in "${TENV[@]}"; do
      case "$a" in -u|[A-Z]*_ENDPOINT=*|GALLEY_*|CARGO_*|FREIGHT_*|STARPORT_*|INSURANCE_*|BRIDGE_*|TRANSPORTER_*) ;;
        *_API_KEY=*) echo "    ${a%%=*}=<set>" ;;
        *=*) echo "    $a" ;;
      esac
    done
    [ "$TEMPORAL_TARGET" = local ] && echo "    (the demos' defaults: localhost:7233, namespace default)"
    echo "  Hub: $HUB_URL · its Temporal $HUB_TEMPORAL · UI $HUB_TEMPORAL_UI"
    echo "  Local Temporal: :$LOCAL_TEMPORAL_PORT $(up "$LOCAL_TEMPORAL_PORT" && echo up || echo down) (always running; DB .ship/temporal.db)"
    echo "  Temporal Cloud settings: $(cloud_ready && echo "present (.ship/temporal-cloud.env) · last check $(cloud_status_line)" || echo "none")"
    echo "  Always local: triage-queue (:7405), beam-aboard (:7709)"
    exit 0 ;;
  check-hub)
    if [ -n "${2:-}" ]; then BOOTH_HUB="$2"; unset BOOTH_TEMPORAL BOOTH_TEMPORAL_UI; set_hub_vars; fi
    check_hub; exit $? ;;
  set-hub)
    [ -n "${2:-}" ] || { echo "usage: ship.sh set-hub <hub IP or name.local>"; exit 2; }
    set_hub "$2"; exit 0 ;;
  set-hub-all)
    [ -n "${2:-}" ] || { echo "usage: ship.sh set-hub-all <hub IP or name.local>"; exit 2; }
    agent_cli set-hub-all "$2"
    exit $? ;;
esac

ONLY=""
SKIP=""
OPEN=1
FORCED_AI=""
FORCED_TARGET=""
NEW_HUB=""
while [ $# -gt 0 ]; do
  case "$1" in
    --offline) FORCED_AI=offline ;;
    --online) FORCED_AI=online ;;
    --only) [ -n "${2:-}" ] || bad_usage "--only needs demo ids, e.g. --only holodeck"; ONLY=",$2,"; shift ;;
    --skip) [ -n "${2:-}" ] || bad_usage "--skip needs demo ids, e.g. --skip holodeck"; SKIP=",$2,"; shift ;;
    --no-open) OPEN=0 ;;
    --station)
      [[ "${2:-}" =~ ^[A-Za-z0-9_-]{1,16}$ ]] || bad_usage "--station needs an id like 1, 2, 3, 4 or laptop"
      STATION_ID="$2"; save_station_env STATION_ID "$2"; echo "This machine is now station $2 (saved in .ship/station.env)"; shift ;;
    --hub)
      [ -n "${2:-}" ] || bad_usage "--hub needs the hub laptop's IP or hostname"
      NEW_HUB="$2"; shift ;;
    --temporal)
      case "${2:-}" in local|hub|cloud) FORCED_TARGET="$2" ;; *) bad_usage "--temporal needs local, hub or cloud" ;; esac
      shift ;;
    -h|--help) usage; exit 0 ;;
    -*) bad_usage "unknown option: $1" ;;
    *) bad_usage "unknown command: $1" ;;
  esac
  shift
done

if [ -n "$NEW_HUB" ]; then
  if had_pgid station-agent || had_pgid launchpad; then
    # The ship is already running here: switch it over instead of starting a second one.
    set_hub "$NEW_HUB"
    echo "The running ship now uses this hub. (Ctrl-C in the original terminal still stops everything.)"
    exit 0
  fi
  BOOTH_HUB="$NEW_HUB"; unset BOOTH_TEMPORAL BOOTH_TEMPORAL_UI; set_hub_vars; ROLE="$(hub_role)"
  save_station_env BOOTH_HUB "$NEW_HUB"; save_station_env BOOTH_TEMPORAL; save_station_env BOOTH_TEMPORAL_UI
  echo "Booth Control hub: $HUB_URL (saved in .ship/station.env)"
fi

for tool in uv npm temporal nc curl; do
  command -v "$tool" >/dev/null || { echo "Missing $tool. See each demo's README for install steps."; exit 1; }
done

echo "Station $STATION_ID · Booth Control hub $HUB_URL ($([ "$ROLE" = hub ] && echo "this machine is the hub" || echo "this machine is a station"))"

# ── Station plan from the hub (network mode, demos switched off) ──
# The agent asks the hub (or uses the last plan it cached) and prints shell lines.
NETWORK_MODE=""; SKIP_PROCS=""
(cd "$ROOT/booth-control" && uv sync --quiet >/dev/null 2>&1)
PLAN=$(agent_cli plan 2>/dev/null || true)
PLAN_TARGET=""
while IFS='=' read -r k v; do
  case "$k" in
    NETWORK_MODE) NETWORK_MODE="$v" ;;
    SKIP_PROCS) SKIP_PROCS=",$v," ;;
    TEMPORAL_TARGET) PLAN_TARGET="$v" ;;
  esac
done <<< "$PLAN"
[ -n "$NETWORK_MODE" ] && echo "Hub plan: network $NETWORK_MODE, Temporal ${PLAN_TARGET:-auto}${SKIP_PROCS//,/ }"

# ── Temporal target for the demos (the station agent switches it later if the hub says so) ──
# Requested: --temporal, else the hub's plan (or its cached copy), else auto.
# auto (and cloud) become Temporal Cloud only if .ship/temporal-cloud.env passes the
# Cloud check (DescribeNamespace with the key); otherwise the fallback: the hub's
# Temporal on a station, this machine's own on the hub laptop.
REQUESTED="${FORCED_TARGET:-${PLAN_TARGET:-auto}}"
echo "$REQUESTED" > "$REQUEST_FILE"
if [ "$REQUESTED" = auto ] || [ "$REQUESTED" = cloud ]; then
  if cloud_ready || [ "$REQUESTED" = cloud ]; then echo "Checking Temporal Cloud (.ship/temporal-cloud.env)..."; fi
  resolve_target "$REQUESTED" "${NETWORK_MODE:-online}"
  TEMPORAL_TARGET="$RESOLVED"
else
  TEMPORAL_TARGET="$REQUESTED"; RESOLVE_NOTE=""
fi
case "$TEMPORAL_TARGET" in
  hub)
    if ! tcp_ok "$HUB_TEMPORAL"; then
      echo "The hub's Temporal ($HUB_TEMPORAL) doesn't answer, so the demos start on this machine's own Temporal."
      echo "The station agent moves them to the hub once it's reachable."
      TEMPORAL_TARGET=local
    elif ! agent_cli ensure-namespace; then
      echo "Couldn't create namespace $STATION_NS on the hub, so the demos start on local Temporal."
      TEMPORAL_TARGET=local
    fi ;;
  cloud)
    if ! cloud_ready; then
      echo "No Temporal Cloud settings in .ship/temporal-cloud.env, so the demos start on local Temporal."
      TEMPORAL_TARGET=local
    fi ;;
esac
echo "$TEMPORAL_TARGET" > "$TARGET_FILE"
case "$TEMPORAL_TARGET" in
  hub) echo "Temporal: the hub's server $HUB_TEMPORAL, namespace $STATION_NS (requested: $REQUESTED)" ;;
  cloud) echo "Temporal: Temporal Cloud, namespace $(cloud_value TEMPORAL_NAMESPACE) (requested: $REQUESTED)" ;;
  *) echo "Temporal: this machine's dev server (localhost:$LOCAL_TEMPORAL_PORT) (requested: $REQUESTED)" ;;
esac
[ -n "$RESOLVE_NOTE" ] && echo "  why: $RESOLVE_NOTE"

# ── AI mode ──
if [ -n "$FORCED_AI" ]; then
  AI_MODE="$FORCED_AI"
elif [ "$NETWORK_MODE" = offline ]; then
  AI_MODE=offline
  echo "Booth Control says offline, so AI demos start in offline mock mode."
elif [ -n "${OPENAI_API_KEY:-}" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
      https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY")" = 200 ]; then
  AI_MODE=online
else
  AI_MODE=offline
  echo "OpenAI key missing or rejected, so AI demos start in offline mock mode (use --online to override)."
fi
echo "AI mode: $AI_MODE"
echo "$AI_MODE" > "$STATE/ai_mode"
echo "${NETWORK_MODE:-online}" > "$STATE/network_mode"
: > "$STATE/adopted"

set -m   # each background job gets its own process group, so we can stop whole trees

cleanup() {
  trap - INT TERM
  echo
  echo "Stopping the ship..."
  local id
  # What we started, plus anything the station agent restarted for us.
  for id in ${STARTED[@]+"${STARTED[@]}"} $(sort -u "$STATE/adopted" 2>/dev/null); do stop_group "$id"; done
  rm -f "$PIDS/ship.pid"
  echo "Done."
  exit 0
}
trap cleanup INT TERM
# The foreground loop's PID: while it's alive, it is the local Temporal watchdog;
# otherwise the station agent takes over (restart-temporal). Never killed by anyone.
echo "$$" > "$PIDS/ship.pid"

# This machine's own Temporal always runs, even while the demos use Cloud or the hub,
# so a switch to offline is instant. A failure here isn't fatal: the watchdog in the
# foreground loop keeps trying.
if up "$LOCAL_TEMPORAL_PORT"; then
  echo "Temporal dev server already running on :$LOCAL_TEMPORAL_PORT"
else
  if [ "$ROLE" = hub ]; then echo "Starting the local Temporal dev server on the LAN (hub; UI http://localhost:$LOCAL_TEMPORAL_UI_PORT)"
  else echo "Starting the local Temporal dev server (UI http://localhost:$LOCAL_TEMPORAL_UI_PORT)"; fi
  : >"$LOGS/temporal.log"
  STARTED+=("temporal")
  start_temporal || echo "Temporal didn't start; see .ship/logs/temporal.log (the watchdog keeps trying)"
fi

# ── Demos ──
WANT=()
for d in "${DEMOS[@]}"; do
  id=$(field "$d" 1); port=$(field "$d" 3)
  if [ "$id" = booth-control ] && [ "$ROLE" != hub ]; then continue; fi
  if [ -n "$ONLY" ] && [ "$id" != launchpad ] && [ "$id" != booth-control ] && [[ "$ONLY" != *",$id,"* ]]; then continue; fi
  if [[ "$SKIP" == *",$id,"* ]]; then continue; fi
  if [[ "$SKIP_PROCS" == *",$id,"* ]]; then echo "  $id switched off for this station (Booth Control)"; continue; fi
  WANT+=("$d")
  if up "$port"; then
    echo "  $id already running on :$port (left alone)"
  else
    launch "$id" "$(field "$d" 2)" "$(field "$d" 4)" "$(field "$d" 5)" "$(field "$d" 6)"
  fi
done

# ── Station agent (Booth Control): a Temporal worker on booth-station-<id> ──
if had_pgid station-agent; then
  echo "  station agent already running (left alone)"
else
  : > "$LOGS/station-agent.log"
  start_agent
fi

# ── Wait for web ports ──
echo "Waiting for demos to come up (first run installs dependencies and can take a few minutes)..."
deadline=$(( $(date +%s) + 300 ))
while :; do
  pending=0
  for d in ${WANT[@]+"${WANT[@]}"}; do up "$(field "$d" 3)" || pending=$((pending + 1)); done
  [ $pending -eq 0 ] && break
  [ "$(date +%s)" -ge $deadline ] && break
  sleep 2
done

LAUNCHPAD_URL="http://localhost:5100/?station=$STATION_ID&hub=$(printf %s "$HUB_URL" | sed 's/:/%3A/g; s#/#%2F#g')"

echo
echo "================================================================"
for d in ${WANT[@]+"${WANT[@]}"}; do
  id=$(field "$d" 1); port=$(field "$d" 3)
  if up "$port"; then printf "  %-18s http://localhost:%s\n" "$id" "$port"
  else printf "  %-18s NOT UP (see .ship/logs/%s.log)\n" "$id" "$id"; fi
done
case "$TEMPORAL_TARGET" in
  hub) echo "  Temporal UI        $HUB_TEMPORAL_UI/namespaces/$STATION_NS (the hub's)" ;;
  cloud) echo "  Temporal UI        https://cloud.temporal.io/namespaces/$(cloud_value TEMPORAL_NAMESPACE) (Temporal Cloud)" ;;
  *) echo "  Temporal UI        http://localhost:$LOCAL_TEMPORAL_UI_PORT" ;;
esac
echo
echo "  Launchpad:         $LAUNCHPAD_URL"
echo "  Station $STATION_ID, Booth Control hub $HUB_URL"
echo "  Ctrl-C stops everything this script started."
echo "================================================================"

[ $OPEN = 1 ] && up 5100 && command -v open >/dev/null && open "$LAUNCHPAD_URL"

# Stay in the foreground until Ctrl-C, restarting the local Temporal dev server
# if it dies (every demo on local Temporal depends on it, and it's the offline
# fallback for the rest). Same restart path as ./start.sh restart-temporal.
while :; do
  sleep 10 & wait $!
  if ! up "$LOCAL_TEMPORAL_PORT"; then
    echo "$(date '+%H:%M:%S') Temporal on :$LOCAL_TEMPORAL_PORT is down; restarting it"
    restart_local_temporal watchdog; rc=$?
    if [ $rc = 0 ]; then echo "  Temporal is back"; [[ " ${STARTED[*]} " == *" temporal "* ]] || STARTED+=("temporal")
    elif [ $rc = 2 ]; then echo "  (the station agent is restarting it)"
    else echo "  Temporal still won't start; see .ship/logs/temporal.log"; fi
  fi
done
