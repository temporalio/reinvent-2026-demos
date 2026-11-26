#!/usr/bin/env python3
"""Run on the laptop: export only one Mini's temporary pairing credential."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--station', choices=list('1234'), required=True)
parser.add_argument('--hub', help='Laptop LAN HTTP(S) origin; auto-detect when omitted')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
if not args.hub:
    import importlib.util
    import yaml
    spec = importlib.util.spec_from_file_location('lan_addresses', root/'scripts/local/addresses.py')
    addresses = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(addresses)
    rows = addresses.lan_addresses()
    if not rows:
        parser.error('No LAN address detected. Supply --hub http://LAPTOP-IP:15101.')
    compose_file = root/'tmp/local/compose.yaml'
    if not compose_file.is_file():
        parser.error('Start ./scripts/local.sh control first.')
    binding = yaml.safe_load(compose_file.read_text())['services']['gateway']['ports'][0]
    host, port, _ = binding.split(':')
    if host != '0.0.0.0':
        parser.error('The laptop is bound to localhost only. Start ./scripts/local.sh control first.')
    args.hub = f'http://{rows[0][1]}:{port}'
u = urlsplit(args.hub)
if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:
    parser.error('--hub must be an HTTP(S) origin')
root = Path(__file__).resolve().parents[2]
docker = next((str(p) for p in [Path.home()/'.docker/bin/docker',Path('/usr/local/bin/docker'),Path('/Applications/Docker.app/Contents/Resources/bin/docker')] if p.is_file()), 'docker')
key = subprocess.check_output([docker,'compose','-p','reinvent-2026-local','-f',str(root/'tmp/local/compose.yaml'),'exec','-T','control-hub','cat','/data/machine-operator.key'], text=True).strip()
if len(key) != 64:
    raise SystemExit('Start the updated laptop control hub before exporting pairing.')
os.umask(0o077)
output = root/'tmp/station-pairing'
output.mkdir(parents=True, exist_ok=True)
station_key = hmac.new(bytes.fromhex(key), ('station:'+args.station).encode(), hashlib.sha256).hexdigest()
pairing = output/f'station-{args.station}.json'
pairing.write_text(json.dumps({'station':args.station, 'hub':args.hub.rstrip('/'), 'key':station_key}, indent=2)+'\n')
operator = output/'operator.key'
operator.write_text(key+'\n')
print(f'Station pairing file: {pairing}\nCopy only that station file to the Mini.\nLaptop-only operator key: {operator}\nNever copy the operator key to a station or commit these files.')
