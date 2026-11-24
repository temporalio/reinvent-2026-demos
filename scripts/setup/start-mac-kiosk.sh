#!/bin/bash
# Installed as a per-user LaunchAgent target; settings stay in a persistent profile.
set -euo pipefail
booth_origin="${1:?Demo origin is required}"
booth_station="${2:?Station ID is required}"
booth_local_repo="${3:-}"
booth_support="$HOME/Library/Application Support/TemporalReinventKiosk"
booth_chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

if [[ -n "$booth_local_repo" ]]; then
  /usr/bin/open -gja Docker
  booth_docker=''
  for candidate in "$HOME/.docker/bin/docker" /usr/local/bin/docker /Applications/Docker.app/Contents/Resources/bin/docker; do
    if [[ -x "$candidate" ]]; then booth_docker="$candidate"; break; fi
  done
  [[ -n "$booth_docker" ]] || { echo 'Docker CLI is not installed.' >&2; exit 1; }
  until "$booth_docker" info >/dev/null 2>&1; do /bin/sleep 3; done
  # Reuse the prepared stack, including its chosen laptop hub; do not rebuild or re-render.
  "$booth_docker" compose -p reinvent-2026-local -f "$booth_local_repo/tmp/local/compose.yaml" up -d --no-build --wait --wait-timeout 180
fi

# The demo origin must be reachable; the laptop's control hub need not be.
until /usr/bin/curl --fail --silent --location --connect-timeout 3 --max-time 10 "$booth_origin/runtime-config.json" >/dev/null; do
  /bin/sleep 3
done
exec /usr/bin/caffeinate -di "$booth_chrome" \
  --user-data-dir="$booth_support/browser" \
  --no-first-run --no-default-browser-check --kiosk \
  "$booth_origin/?station=$booth_station"
