#!/bin/bash
# Reload only this user's booth service; launchd can release its label slowly.
set -euo pipefail
if [[ $# != 3 ]]; then
  echo 'Usage: reload-mac-service.sh gui/UID LABEL /absolute/service.plist' >&2
  exit 2
fi
booth_domain="$1"
booth_label="$2"
booth_plist="$3"
booth_service="$booth_domain/$booth_label"
launchctl bootout "$booth_service" 2>/dev/null || true
for ((booth_attempt=0; booth_attempt<10; booth_attempt++)); do
  if ! launchctl print "$booth_service" >/dev/null 2>&1; then
    break
  fi
  if ((booth_attempt == 9)); then
    echo "Station service did not unload after 9 seconds: $booth_service" >&2
    exit 1
  fi
  sleep 1
done
for ((booth_attempt=1; booth_attempt<=8; booth_attempt++)); do
  if booth_error="$(launchctl bootstrap "$booth_domain" "$booth_plist" 2>&1)"; then
    exit 0
  else
    booth_status=$?
  fi
  # Error 5 can outlast the visible registration. Other errors need attention.
  if [[ "$booth_status" != 5 ]] || ((booth_attempt == 8)); then
    printf '%s\n' "$booth_error" >&2
    printf 'Could not load %s. Check: launchctl print %s\n' "$booth_plist" "$booth_service" >&2
    exit "$booth_status"
  fi
  echo "Waiting for macOS to release the station service ($booth_attempt/8)..." >&2
  sleep 1
done
