#!/usr/bin/env python3
"""Pair a booth over the LAN with a short code and password-authenticated key exchange."""
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
    from spake2 import SPAKE2_A
    hub = origin(hub)
    code = code.replace('-', '').replace(' ', '').strip()
    if station not in ('1','2','3','4') or not re.fullmatch('[0-9]{6}',code):
        raise ValueError('Use station 1–4 and the six-digit pairing code from the controller.')
    exchange = SPAKE2_A(code.encode(),idA=('booth:'+station).encode(),idB=b'controller')
    outgoing = exchange.start()
    nonce = secrets.token_hex(16)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    def post(phase, body):
        request = urllib.request.Request(f'{hub}/control-api/booth-config/{station}/{phase}',
            data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
        with opener.open(request,timeout=8) as response:
            reply = json.loads(response.read(65537))
        if not isinstance(reply,dict) or not isinstance(reply.get('payload'),str) or len(reply['payload'])>4096 or not isinstance(reply.get('signature'),str) or not re.fullmatch('[a-f0-9]{64}',reply['signature']):
            raise ValueError('The pairing response was not valid.')
        return reply
    reply = post('start',{'message':outgoing.hex(),'nonce':nonce})
    data = json.loads(reply['payload'])
    if (not isinstance(data,dict) or data.get('nonce')!=nonce or data.get('station')!=station
            or not isinstance(data.get('session'),str) or not re.fullmatch('[a-f0-9]{32}',data['session'])
            or not isinstance(data.get('message'),str) or not re.fullmatch('[a-f0-9]{66}',data['message'])):
        raise ValueError('The pairing response was not valid.')
    try:
        key = exchange.finish(bytes.fromhex(data['message']))
    except Exception:
        raise ValueError('The pairing response could not be verified.') from None
    expected = hmac.new(key,('PAIR-SERVER\n'+reply['payload']).encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,reply['signature']):
        raise ValueError('Incorrect pairing code or unverified controller. Check the six digits and retry; after five attempts, request a fresh code.')
    session = data['session']
    proof = hmac.new(key,f'PAIR-CLIENT\n{session}\n{nonce}'.encode(),hashlib.sha256).hexdigest()
    reply = post('finish',{'session':session,'proof':proof})
    expected = hmac.new(key,('PAIR-FINISH\n'+reply['payload']).encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,reply['signature']):
        raise ValueError('The pairing response could not be verified. No configuration was saved.')
    config = json.loads(reply['payload'])
    if not isinstance(config,dict) or config.get('station')!=station or not isinstance(config.get('hub'),str):
        raise ValueError('The pairing response belongs to another station.')
    return {'station':station,'hub':origin(config['hub']),
            'key':hmac.new(key,f'STATION-KEY\n{station}\n{session}'.encode(),hashlib.sha256).hexdigest()}


def http_error_message(status):
    if status == 403:
        return 'Pairing blocked by the controller gateway (403). On the controller, update main and run ./scripts/local.sh control, then retry.'
    if status == 429:
        return 'Five pairing attempts used (429). Generate a fresh code on the controller.'
    if status == 404:
        return 'Pairing code expired or was used (404). Generate a fresh code on the controller; both machines must use current main.'
    return f'Controller rejected pairing ({status}). Check the controller service before retrying.'


def main():
    parser = argparse.ArgumentParser(description='Download station configuration from the control laptop; no file sharing or USB.')
    parser.add_argument('controller', nargs='?', default=os.environ.get('CONTROL_HUB_URL'), help='Control laptop IP, such as 192.168.86.108')
    parser.add_argument('station', nargs='?', choices=list('1234'))
    parser.add_argument('--code-file', type=Path, help='Read a one-time code from a protected file for unattended testing')
    args = parser.parse_args()
    try:
        hub = args.controller or input('Control laptop IP: ').strip()
        station = args.station or input('Booth station number (1–4): ').strip()
        code = args.code_file.read_text() if args.code_file else getpass.getpass('Six-digit code from the control laptop (e.g. 123-456): ')
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
        print(http_error_message(error.code),file=sys.stderr)
        return 1
    except (OSError,ValueError,EOFError) as error:
        print(f'Pairing failed: {error}',file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
