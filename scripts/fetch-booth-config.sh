#!/usr/bin/env bash
set -euo pipefail
booth_root="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$booth_root/scripts/local/fetch_config.py" "$@"
