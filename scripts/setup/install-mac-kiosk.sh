#!/bin/bash
# Run on a Mac Mini's booth account, not on the operator laptop.
set -euo pipefail
usage() {
  echo 'Usage: install-mac-kiosk.sh --station 1|2|3|4 [--url http(s)://host:port] [--local-repo /absolute/repo] [--dry-run]' >&2
  exit 2
}
booth_station=''
booth_origin='https://reinvent-booth.tmprl-demo.cloud'
booth_local_repo=''
booth_dry_run=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --station|--url|--local-repo)
      [[ $# -ge 2 ]] || usage
      case "$1" in
        --station) booth_station="$2";;
        --url) booth_origin="${2%/}";;
        --local-repo) booth_local_repo="$2";;
      esac
      shift 2;;
    --dry-run) booth_dry_run=true; shift;;
    *) usage;;
  esac
done
[[ "$booth_station" =~ ^[1-4]$ ]] || usage
[[ "$booth_origin" =~ ^https?://[^/?#[:space:]@]+$ ]] || { echo 'Use an HTTP(S) origin without a path, query, or credentials.' >&2; exit 2; }
if [[ -n "$booth_local_repo" && "$booth_local_repo" != /* ]]; then echo 'Local repository path must be absolute.' >&2; exit 2; fi
booth_support="$HOME/Library/Application Support/TemporalReinventKiosk"
booth_plist="$HOME/Library/LaunchAgents/io.temporal.reinvent-kiosk.plist"
if "$booth_dry_run"; then
  printf 'Station: %s\nDemo URL: %s/?station=%s\nProfile: %s/browser\nLaunchAgent: %s\nLocal repo: %s\nNo files or login items changed.\n' "$booth_station" "$booth_origin" "$booth_station" "$booth_support" "$booth_plist" "${booth_local_repo:-not used}"
  exit 0
fi
[[ "$(/usr/bin/uname -s)" == Darwin ]] || { echo 'Install this on macOS.' >&2; exit 2; }
[[ -x '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ]] || { echo 'Install Google Chrome in /Applications first.' >&2; exit 2; }
if [[ -n "$booth_local_repo" && ! -f "$booth_local_repo/tmp/local/compose.yaml" ]]; then echo 'Prepare the local stack with scripts/local.sh up first.' >&2; exit 2; fi
umask 077
mkdir -p "$booth_support/browser" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/TemporalReinventKiosk"
booth_source="$(cd "$(dirname "$0")" && pwd)/start-mac-kiosk.sh"
/usr/bin/install -m 700 "$booth_source" "$booth_support/start-kiosk.sh"
booth_pending="$booth_support/agent.plist.pending"
/usr/bin/plutil -create xml1 "$booth_pending"
/usr/bin/plutil -insert Label -string io.temporal.reinvent-kiosk "$booth_pending"
/usr/bin/plutil -insert ProgramArguments -array "$booth_pending"
/usr/bin/plutil -insert ProgramArguments.0 -string /bin/bash "$booth_pending"
/usr/bin/plutil -insert ProgramArguments.1 -string "$booth_support/start-kiosk.sh" "$booth_pending"
/usr/bin/plutil -insert ProgramArguments.2 -string "$booth_origin" "$booth_pending"
/usr/bin/plutil -insert ProgramArguments.3 -string "$booth_station" "$booth_pending"
/usr/bin/plutil -insert ProgramArguments.4 -string "$booth_local_repo" "$booth_pending"
/usr/bin/plutil -insert RunAtLoad -bool true "$booth_pending"
/usr/bin/plutil -insert KeepAlive -bool true "$booth_pending"
/usr/bin/plutil -insert ThrottleInterval -integer 10 "$booth_pending"
/usr/bin/plutil -insert StandardOutPath -string "$HOME/Library/Logs/TemporalReinventKiosk/stdout.log" "$booth_pending"
/usr/bin/plutil -insert StandardErrorPath -string "$HOME/Library/Logs/TemporalReinventKiosk/stderr.log" "$booth_pending"
/usr/bin/plutil -lint "$booth_pending"
booth_domain="gui/$(/usr/bin/id -u)"
/bin/mv "$booth_pending" "$booth_plist"
bash "$(dirname "$0")/reload-mac-service.sh" "$booth_domain" io.temporal.reinvent-kiosk "$booth_plist"
printf 'Installed station %s. Kiosk starts now and at login. Settings remain in %s/browser.\n' "$booth_station" "$booth_support"
