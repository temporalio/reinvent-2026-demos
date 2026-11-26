#!/bin/bash
# Install a macOS supervisor. --test runs an isolated profile without login items.
set -euo pipefail
booth_root="$(cd "$(dirname "$0")/../.." && pwd)"
booth_pair=''
booth_station=''
booth_hosted='https://reinvent-booth.tmprl-demo.cloud'
booth_local='http://127.0.0.1:15101'
booth_listen='127.0.0.1:15103'
booth_test=false
booth_dry=false
usage(){ echo 'Usage: install-mac-station.sh --station 1|2|3|4 --pairing-file /path/station-N.json [--hosted https://host] [--local http://127.0.0.1:15101] [--listen 127.0.0.1:15103] [--test|--dry-run]' >&2; exit 2; }
while [[ $# -gt 0 ]];do
 case "$1" in
  --station|--pairing-file|--hosted|--local|--listen)
   [[ $# -ge 2 ]]||usage
   case "$1" in --station)booth_station="$2";;--pairing-file)booth_pair="$2";;--hosted)booth_hosted="${2%/}";;--local)booth_local="${2%/}";;--listen)booth_listen="$2";;esac
   shift 2;;
  --test)booth_test=true;shift;;
  --dry-run)booth_dry=true;shift;;
  *)usage;;
 esac
done
[[ -f "$booth_pair" ]]||usage
if ! "$booth_dry" && [[ ! -f "$booth_root/tmp/local/compose.yaml" ]];then echo 'Prepare the local stack using scripts/local.sh up first.' >&2;exit 2;fi
booth_docker="$(command -v docker || true)"
for candidate in "$booth_docker" "$HOME/.docker/bin/docker" /usr/local/bin/docker /Applications/Docker.app/Contents/Resources/bin/docker;do
 if [[ -x "$candidate" ]];then booth_docker="$candidate";break;fi
done
if "$booth_dry" && [[ -z "$booth_docker" ]];then booth_docker=/usr/bin/docker;fi
[[ -n "$booth_docker" ]]||{ echo 'Install Docker Desktop first.' >&2;exit 2; }
booth_support="$HOME/Library/Application Support/TemporalReinventStation"
if ! "$booth_dry";then
 [[ "$(uname -s)" == Darwin ]]||{ echo "Install this on macOS." >&2;exit 2; }
 [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]||{ echo "Install Google Chrome first." >&2;exit 2; }
fi
if "$booth_test";then booth_support="$booth_root/tmp/station-test";fi
booth_config="$booth_support/config.json"
# Validate without printing pairing credentials or modifying this Mac.
export BOOTH_PAIR_FILE="$booth_pair" BOOTH_SUPPORT_DIR="$booth_support" BOOTH_HOSTED_ORIGIN="$booth_hosted" BOOTH_LOCAL_ORIGIN="$booth_local" BOOTH_LISTEN_ADDR="$booth_listen" BOOTH_REPO_DIR="$booth_root" BOOTH_DOCKER_BIN="$booth_docker" BOOTH_DRY_RUN="$booth_dry" BOOTH_STATION_NUMBER="$booth_station"
python3 - <<'PY'
import ipaddress,json,os,re
from pathlib import Path
from urllib.parse import urlsplit
p=json.loads(Path(os.environ['BOOTH_PAIR_FILE']).read_text())
if os.environ['BOOTH_STATION_NUMBER'] and p.get('station')!=os.environ['BOOTH_STATION_NUMBER']:raise SystemExit('Station number does not match the pairing file.')
if p.get('station') not in list('1234') or not re.fullmatch('[a-f0-9]{64}',p.get('key','')):raise SystemExit('Invalid pairing file')
for k in ('hub',):
 u=urlsplit(p[k]);assert u.scheme in ('http','https') and u.hostname and not u.username and not u.password and u.path in ('','/') and not u.query and not u.fragment,'Invalid hub origin'
for k in ('BOOTH_HOSTED_ORIGIN','BOOTH_LOCAL_ORIGIN'):
 u=urlsplit(os.environ[k]);assert u.scheme in ('http','https') and u.hostname and not u.username and not u.password and u.path in ('','/') and not u.query and not u.fragment,'Invalid demo origin'
 if k=='BOOTH_LOCAL_ORIGIN':assert u.hostname=='localhost' or ipaddress.ip_address(u.hostname).is_loopback,'Local runtime must use loopback'
host,port=os.environ['BOOTH_LISTEN_ADDR'].rsplit(':',1);assert ipaddress.ip_address(host).is_loopback and 1024<=int(port)<=65535,'Invalid loopback listener'
if os.environ['BOOTH_DRY_RUN']=='true':
 print(f"Station {p['station']}: kiosk at http://{os.environ['BOOTH_LISTEN_ADDR']}/; online {os.environ['BOOTH_HOSTED_ORIGIN']}; local {os.environ['BOOTH_LOCAL_ORIGIN']}. No files or login items changed.")
else:
 os.umask(0o077)
 support=Path(os.environ['BOOTH_SUPPORT_DIR']);support.mkdir(parents=True,exist_ok=True)
 p.update(hosted=os.environ['BOOTH_HOSTED_ORIGIN'],local=os.environ['BOOTH_LOCAL_ORIGIN'],listen=os.environ['BOOTH_LISTEN_ADDR'],repo=os.environ['BOOTH_REPO_DIR'],docker=os.environ['BOOTH_DOCKER_BIN'],chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',support=str(support))
 config=support/'config.json';config.write_text(json.dumps(p,indent=2)+'\n');config.chmod(0o600)
PY
if "$booth_dry";then exit 0;fi
[[ "$(uname -s)" == Darwin ]]||{ echo 'Install this on macOS.' >&2;exit 2; }
[[ -x '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ]]||{ echo 'Install Google Chrome first.' >&2;exit 2; }
booth_arch="$(uname -m)";[[ "$booth_arch" != x86_64 ]]||booth_arch=amd64
[[ "$booth_arch" != aarch64 ]]||booth_arch=arm64
"$booth_docker" build -f "$booth_root/scripts/station-agent/Dockerfile" --build-arg "TARGETARCH=$booth_arch" -t reinvent-station-agent "$booth_root/scripts/station-agent"
booth_container="$("$booth_docker" create reinvent-station-agent /station-agent)"
trap '"$booth_docker" rm "$booth_container" >/dev/null 2>&1 || true' EXIT
"$booth_docker" cp "$booth_container:/station-agent" "$booth_support/station-agent.pending"
chmod 700 "$booth_support/station-agent.pending"
mv "$booth_support/station-agent.pending" "$booth_support/station-agent"
"$booth_docker" rm "$booth_container" >/dev/null
trap - EXIT
if "$booth_test";then
 echo "Isolated test profile: $booth_support/browser. No login items changed. Ctrl-C stops this test."
 exec "$booth_support/station-agent" --config "$booth_config"
fi
# Replace the old launcher, which would otherwise open a second booth profile.
booth_domain="gui/$(id -u)"
launchctl bootout "$booth_domain/io.temporal.reinvent-kiosk" 2>/dev/null||true
booth_plist="$HOME/Library/LaunchAgents/io.temporal.reinvent-station.plist"
mkdir -p "$HOME/Library/LaunchAgents"
export BOOTH_PLIST_FILE="$booth_plist"
python3 - <<'PY'
import os,plistlib
from pathlib import Path
s=Path(os.environ['BOOTH_SUPPORT_DIR'])
p={'Label':'io.temporal.reinvent-station','ProgramArguments':[str(s/'station-agent'),'--config',str(s/'config.json')],'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,'StandardOutPath':'/dev/null','StandardErrorPath':'/dev/null'}
path=Path(os.environ['BOOTH_PLIST_FILE']);path.write_bytes(plistlib.dumps(p));path.chmod(0o600)
PY
launchctl bootout "$booth_domain/io.temporal.reinvent-station" 2>/dev/null||true
launchctl bootstrap "$booth_domain" "$booth_plist"
printf 'Station supervisor installed. Kiosk starts now and at login. Profile: %s/browser\n' "$booth_support"
