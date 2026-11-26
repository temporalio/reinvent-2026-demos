#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
usage() {
  cat <<'HELP'
Usage: ./scripts/local.sh [COMMAND] [OPTIONS]

With no command, use ROLE=control or ROLE=booth from .env.
Booths also use CONTROL_IP and BOOTH=1|2|3|4.
Run ./scripts/local.sh --test for a foreground booth rehearsal.

Control laptop:
  control [--port 15101] [--admin-port 15102]          Start services with LAN access; print control URLs.
  pair --station 1|2|3|4          Show a one-time network pairing code.
       [--hub http://IP:15101]    Auto-detect the laptop LAN address when omitted.

Booth Mac Mini / personal MacBook:
  booth --station 1|2|3|4 [--test] [--pairing-file FILE]
                                 Prepare containers, then launch Chrome in kiosk mode.
                                 --test: foreground, isolated profile, no login item.
                                 Without --test: install automatic startup at login.
  station --station N --pairing-file FILE [--test]
                                 Launch/install using an already prepared stack.

Other commands:
  up [--apps comma-separated-ids] [--port 15101]
                                 Prepare/start containers only; does not launch Chrome.
  render                         Write and validate Compose without starting services.
  down | status | logs [SERVICE]
  --help                         Show this help without installing anything.

On a booth, first run: ./scripts/fetch-booth-config.sh CONTROLLER-IP STATION
Enter the one-time code from `pair`. No USB or file sharing is needed.
The laptop-only operator.key must never leave the control laptop.
BOOTH_BIND_ADDRESS=0.0.0.0 enables LAN access for plain `up`.
CONTROL_HUB_URL=http://IP:15101 selects a laptop hub for plain `up`.
HELP
}
# Help must work before parsing local configuration or installing tools.
for arg in "$@";do if [[ "$arg" == --help || "$arg" == -h || "$arg" == help ]];then usage;exit 0;fi;done
if [[ "${BOOTH_ENV_LOADED:-}" != 1 ]];then exec python3 "$ROOT/scripts/local/env_defaults.py" "$@";fi
command="${1:-}"
if [[ -z "$command" || "$command" == --* ]];then
  command="${ROLE:-up}"
  [[ "$command" == booth || "$command" == control || "$command" == up ]]||{ echo 'ROLE must be booth or control.' >&2;exit 2; }
else
  shift
fi
if [[ "$command" == -h || "$command" == --help || "$command" == help ]];then usage;exit 0;fi
for arg in "$@";do if [[ "$arg" == --help || "$arg" == -h ]];then usage;exit 0;fi;done
if ! command -v docker >/dev/null 2>&1 && [[ -x "$HOME/.docker/bin/docker" ]];then export PATH="$HOME/.docker/bin:$PATH";fi
PYTHON="$ROOT/tmp/tools/bin/python"
prepare_tools() {
  if [[ ! -x "$PYTHON" ]];then
    python3 -m venv tmp/tools
  fi
  if ! "$PYTHON" -c 'import spake2, yaml, jsonschema' >/dev/null 2>&1;then
    "$PYTHON" -m pip install -r requirements-tooling.txt
  fi
}
case "$command" in
  control)
    export BOOTH_BIND_ADDRESS=0.0.0.0
    export CONTROL_HUB_URL=http://control-hub:8090
    command=up
    set -- --controller "$@";;
  pair)
    prepare_tools
    exec "$PYTHON" "$ROOT/scripts/setup/export-station-pairing.py" "$@";;
  station)
    exec "$ROOT/scripts/setup/install-mac-station.sh" "$@";;
  booth)
    booth_station="${BOOTH:-}";booth_pair='';booth_dry=false
    if [[ -n "$booth_station" ]];then set -- --station "$booth_station" "$@";fi
    booth_original=("$@")
    while [[ $# -gt 0 ]];do
      case "$1" in
        --station|--pairing-file|--hosted|--local|--listen)
          [[ $# -ge 2 ]]||{ usage >&2;exit 2; }
          case "$1" in --station)booth_station="$2";;--pairing-file)booth_pair="$2";;esac
          shift 2;;
        --test)shift;;
        --dry-run)booth_dry=true;shift;;
        *)echo "Unknown booth option: $1" >&2;usage >&2;exit 2;;
      esac
    done
    [[ "$booth_station" =~ ^[1-4]$ ]]||{ echo 'Choose the booth machine with --station 1, 2, 3, or 4.' >&2;exit 2; }
    if [[ -z "$booth_pair" && -f "$ROOT/tmp/booth-config/station-$booth_station.json" ]];then booth_pair="$ROOT/tmp/booth-config/station-$booth_station.json";booth_original+=(--pairing-file "$booth_pair");fi
    if [[ -z "$booth_pair" && -n "${CONTROL_IP:-}" ]] && ! "$booth_dry";then
      "$ROOT/scripts/fetch-booth-config.sh" "$CONTROL_IP" "$booth_station"
      booth_pair="$ROOT/tmp/booth-config/station-$booth_station.json"
      booth_original+=(--pairing-file "$booth_pair")
    fi
    [[ -f "$booth_pair" ]]||{ echo "Pair this machine first. On the control laptop run: ./scripts/local.sh pair --station $booth_station" >&2;echo "Then run: ./scripts/fetch-booth-config.sh CONTROLLER-IP $booth_station" >&2;exit 2; }
    booth_hub="$(python3 - "$booth_pair" "$booth_station" <<'PY'
import json,re,sys
from pathlib import Path
from urllib.parse import urlsplit
try:
 p=json.loads(Path(sys.argv[1]).read_text())
 if not isinstance(p,dict):raise ValueError('Invalid pairing file.')
 if p.get('station')!=sys.argv[2]:raise ValueError('The pairing file belongs to a different station.')
 if not isinstance(p.get('key'),str) or not re.fullmatch('[a-f0-9]{64}',p['key']):raise ValueError('The pairing file has an invalid station key.')
 hub=p.get('hub','');u=urlsplit(hub)
 if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:raise ValueError('The pairing file has an invalid hub URL.')
 print(hub.rstrip('/'))
except (OSError,ValueError) as e:
 raise SystemExit(str(e))
PY
)"
    if ! "$booth_dry";then
      BOOTH_BIND_ADDRESS=127.0.0.1 CONTROL_HUB_URL="$booth_hub" "$ROOT/scripts/local.sh" up
    fi
    exec "$ROOT/scripts/setup/install-mac-station.sh" "${booth_original[@]}";;
  up|render|down|status|logs);;
  *)usage >&2;exit 2;;
esac
prepare_tools
if [[ "$command" == up ]];then
  command -v docker >/dev/null 2>&1||{ echo 'Install Docker Desktop first, then rerun this command.' >&2;exit 1; }
  if ! "$PYTHON" -c 'import subprocess,sys
try: sys.exit(subprocess.run(["docker","info"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5).returncode)
except (OSError,subprocess.TimeoutExpired): sys.exit(1)';then
    if [[ "$(uname -s)" == Darwin ]];then /usr/bin/open -gja Docker;fi
    echo 'Waiting for Docker Desktop. Complete any first-run prompts in Docker.'
    booth_deadline=$((SECONDS+120))
    until "$PYTHON" -c 'import subprocess,sys
try: sys.exit(subprocess.run(["docker","info"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5).returncode)
except (OSError,subprocess.TimeoutExpired): sys.exit(1)';do
      if ((SECONDS>=booth_deadline));then echo 'Docker is not ready. Open Docker Desktop, finish its setup, then rerun.' >&2;exit 1;fi
      sleep 3
    done
  fi
fi
if [[ "$command" == up || "$command" == render ]];then
  "$PYTHON" scripts/local/compose.py --bind-address "${BOOTH_BIND_ADDRESS:-127.0.0.1}" --control-hub-url "${CONTROL_HUB_URL:-http://control-hub:8090}" "$@"
fi
compose=(docker compose -p reinvent-2026-local -f "$ROOT/tmp/local/compose.yaml")
case "$command" in
  up)
    "${compose[@]}" up -d --build --remove-orphans --wait --wait-timeout 180
    "$PYTHON" scripts/local/addresses.py tmp/local/compose.yaml;;
  render)"${compose[@]}" config --quiet;;
  down)"${compose[@]}" down;;
  status)"${compose[@]}" ps -a;;
  logs)"${compose[@]}" logs --tail 100 "$@";;
esac
