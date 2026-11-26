#!/usr/bin/env bash
set -euo pipefail
booth_root="$(cd "$(dirname "$0")/.." && pwd)"
booth_python="$booth_root/tmp/tools/bin/python"
if [[ ! -x "$booth_python" ]];then python3 -m venv "$booth_root/tmp/tools";fi
if ! "$booth_python" -c 'import spake2' >/dev/null 2>&1;then
  "$booth_python" -m pip install -r "$booth_root/requirements-tooling.txt"
fi
exec "$booth_python" "$booth_root/scripts/local/fetch_config.py" "$@"
