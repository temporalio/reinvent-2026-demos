#!/usr/bin/env python3
"""Run on the laptop: issue a one-time code for one booth."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import time
import secrets
import urllib.request
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
# Issue through the signed operator endpoint, reachable only on the local admin listener.
import yaml
compose = yaml.safe_load((root/'tmp/local/compose.yaml').read_text())
ports = compose['services']['gateway']['ports']
if len(ports)<2:
    raise SystemExit('Start ./scripts/local.sh control first to enable the private admin listener.')
admin_port = ports[1].split(':')[1]
base = f'http://127.0.0.1:{admin_port}'
path = '/control-api/machines/operator'
at, nonce = int(time.time()), secrets.token_hex(16)
payload = json.dumps({'action':'download','station':args.station,'hub':args.hub.rstrip('/')},separators=(',',':'))
def sign(verb, at, content):
    return hmac.new(bytes.fromhex(key),f'{verb}\n{path}\n{at}\n{nonce}\n{content}'.encode(),hashlib.sha256).hexdigest()
envelope = {'time':at,'nonce':nonce,'payload':payload,'signature':sign('POST',at,payload)}
request = urllib.request.Request(base+path,data=json.dumps(envelope).encode(),headers={'Content-Type':'application/json','Origin':base})
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(request,timeout=5) as response:
    reply = json.load(response)
if reply.get('nonce')!=nonce or not hmac.compare_digest(sign('REPLY',reply['time'],reply['payload']),reply['signature']):
    raise SystemExit('Controller response signature did not verify.')
result = json.loads(reply['payload'])
code = result['code'][:3]+'-'+result['code'][3:]
operator = output/'operator.key'
operator.write_text(key+'\n')
print(f'Booth {args.station} one-time pairing code (expires in 2 minutes; 5 attempts): {code}')
target = u.hostname if u.scheme=='http' and u.port==15101 and ':' not in u.hostname else args.hub.rstrip('/')
print(f'On that booth run: ./scripts/fetch-booth-config.sh {target} {args.station}')
print('Enter the code when prompted. It works once; re-pairing revokes the previous station key.')
print(f'Laptop-only operator key: {operator}. Keep it on this laptop.')
