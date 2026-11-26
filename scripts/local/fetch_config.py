#!/usr/bin/env python3
"""Pair a booth over the LAN without sending the one-time code or station key."""
import argparse
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request


def origin(value):
    if '://' not in value:
        value = 'http://' + value
        u = urllib.parse.urlsplit(value)
        if u.port is None:
            value += ':15101'
    u = urllib.parse.urlsplit(value)
    if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:
        raise ValueError('Use the control laptop IP or an HTTP(S) origin, such as 192.168.86.108.')
    _ = u.port
    return value.rstrip('/')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


def fetch_pairing(hub, station, code):
    hub = origin(hub)
    code = code.replace('-', '').replace(' ', '').strip().lower()
    if station not in ('1','2','3','4') or not re.fullmatch('[a-f0-9]{32}', code):
        raise ValueError('Use station 1–4 and the one-time code from the control laptop.')
    secret = bytes.fromhex(code)
    ticket = hashlib.sha256(secret).hexdigest()
    nonce = secrets.token_hex(16)
    proof = hmac.new(secret, f'CONFIG-REQUEST\n{station}\n{nonce}\n{ticket}'.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(f'{hub}/control-api/booth-config/{ticket}?station={station}',
                                 headers={'X-Booth-Nonce':nonce,'X-Booth-Proof':proof})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=8) as response:
        reply = json.loads(response.read(65537))
    if not isinstance(reply,dict):
        raise ValueError('The pairing response was not valid.')
    payload = reply.get('payload')
    if not isinstance(payload,str) or len(payload)>4096 or reply.get('nonce')!=nonce:
        raise ValueError('The pairing response was not valid.')
    expected = hmac.new(secret, f'CONFIG-REPLY\n{nonce}\n{payload}'.encode(), hashlib.sha256).hexdigest()
    if not isinstance(reply.get('signature'),str) or not hmac.compare_digest(expected,reply['signature']):
        raise ValueError('The pairing response could not be verified. No configuration was saved.')
    data = json.loads(payload)
    if not isinstance(data,dict) or data.get('station')!=station or not isinstance(data.get('hub'),str):
        raise ValueError('The pairing response belongs to another station.')
    data['hub'] = origin(data['hub'])
    data['key'] = hmac.new(secret, f'STATION-KEY\n{station}\n{nonce}'.encode(), hashlib.sha256).hexdigest()
    return data


def main():
    parser = argparse.ArgumentParser(description='Download station configuration from the control laptop; no file sharing or USB.')
    parser.add_argument('controller', nargs='?', default=os.environ.get('CONTROL_HUB_URL'), help='Control laptop IP, such as 192.168.86.108')
    parser.add_argument('station', nargs='?', choices=list('1234'))
    parser.add_argument('--code-file', type=Path, help='Read a one-time code from a protected file for unattended testing')
    args = parser.parse_args()
    try:
        hub = args.controller or input('Control laptop IP: ').strip()
        station = args.station or input('Booth station number (1–4): ').strip()
        code = args.code_file.read_text() if args.code_file else getpass.getpass('One-time code from the control laptop: ')
        config = fetch_pairing(hub,station,code)
        root = Path(__file__).resolve().parents[2]
        os.umask(0o077)
        directory = root/'tmp/booth-config'
        directory.mkdir(parents=True,exist_ok=True)
        target = directory/f'station-{station}.json'
        pending = target.with_suffix('.json.pending')
        pending.write_text(json.dumps(config,indent=2)+'\n')
        pending.chmod(0o600)
        pending.replace(target)
        print(f'Paired booth {station}. Configuration saved privately to {target}.')
        print(f'For this MacBook rehearsal: ./scripts/local.sh booth --station {station} --test')
        print(f'For an event Mini with login startup: ./scripts/local.sh booth --station {station}')
    except urllib.error.HTTPError as error:
        print(f'Pairing failed ({error.code}). Generate a fresh code on the controller and try again.',file=sys.stderr)
        return 1
    except (OSError,ValueError,EOFError) as error:
        print(f'Pairing failed: {error}',file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
