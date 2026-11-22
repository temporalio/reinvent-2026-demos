#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PYTHON="$ROOT/tmp/tools/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  python3 -m venv tmp/tools
  "$ROOT/tmp/tools/bin/pip" install -r requirements-tooling.txt
fi
command="${1:-up}"
shift || true
if [[ "$command" == up || "$command" == render ]]; then
  "$PYTHON" scripts/local/compose.py --bind-address "${BOOTH_BIND_ADDRESS:-127.0.0.1}" --control-hub-url "${CONTROL_HUB_URL:-http://control-hub:8090}" "$@"
fi
compose=(docker compose -p reinvent-2026-local -f "$ROOT/tmp/local/compose.yaml")
case "$command" in
  up) "${compose[@]}" up -d --build --remove-orphans --wait --wait-timeout 180; "$PYTHON" -c 'import yaml; s=yaml.safe_load(open("tmp/local/compose.yaml")); print("Local booth: http://localhost:"+s["services"]["gateway"]["ports"][0].split(":")[1])'  ;;
  render) "${compose[@]}" config --quiet ;;
  down) "${compose[@]}" down ;;
  status) "${compose[@]}" ps -a ;;
  logs) "${compose[@]}" logs --tail 100 "$@" ;;
  *) echo 'Usage: scripts/local.sh up|render [--apps comma-separated-demo-ids] [--port 15101] | down|status|logs. BOOTH_BIND_ADDRESS=0.0.0.0 opts the gateway into LAN access; CONTROL_HUB_URL selects a shared hub origin.' >&2; exit 2 ;;
esac
