"""LAN station commands, signed independently of the browser's date PIN.

Only the laptop's local SQLite hub enables this service. Each Mini receives a
station-scoped key; the operator key stays on the laptop. Signatures cover the
route, time, nonce and exact payload. Responses bind the same nonce. No endpoint
accepts a shell command, executable, browser URL or filesystem path.
"""
from contextlib import closing
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading


class MachineError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def signature(key, verb, path, at, nonce, payload):
    message = f'{verb}\n{path}\n{at}\n{nonce}\n{payload}'.encode()
    return hmac.new(bytes.fromhex(key), message, hashlib.sha256).hexdigest()


class Machines:
    def __init__(self, directory):
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        key_path = directory / 'machine-operator.key'
        try:
            fd = os.open(key_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, 'w') as stream:
                stream.write(secrets.token_hex(32))
        self.key = key_path.read_text().strip()
        if not re.fullmatch('[a-f0-9]{64}', self.key):
            raise ValueError('Invalid machine operator key file')
        self.filename = str(directory / 'machines.sqlite3')
        self.lock = threading.RLock()
        with closing(sqlite3.connect(self.filename)) as db:
            db.execute('CREATE TABLE IF NOT EXISTS machines (station TEXT PRIMARY KEY, status TEXT, last_seen REAL, command TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS nonces (principal TEXT, nonce TEXT, expires REAL, PRIMARY KEY(principal,nonce))')
            db.commit()

    def station_key(self, station):
        return hmac.new(bytes.fromhex(self.key), ('station:' + station).encode(), hashlib.sha256).hexdigest()

    def handle(self, path, envelope, now):
        match = re.fullmatch(r'/control-api/machines/(operator|[1-4])', path)
        if not match:
            raise MachineError(404, 'Machine route not found.')
        who = match[1]
        key = self.key if who == 'operator' else self.station_key(who)
        at, nonce, payload, signed = (envelope.get(k) for k in ('time', 'nonce', 'payload', 'signature'))
        if (type(at) is not int or abs(now-at) > 60 or not isinstance(nonce, str)
                or not re.fullmatch('[a-f0-9]{32}', nonce) or not isinstance(payload, str)
                or len(payload) > 4096 or not isinstance(signed, str)
                or not hmac.compare_digest(signature(key, 'POST', path, at, nonce, payload), signed)):
            raise MachineError(401, 'Machine signature was not accepted. Check pairing and clock.')
        try:
            request = json.loads(payload)
        except ValueError:
            raise MachineError(422, 'Invalid machine request.') from None
        if not isinstance(request, dict):
            raise MachineError(422, 'Invalid machine request.')
        with self.lock, closing(sqlite3.connect(self.filename)) as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM nonces WHERE expires < ?', (now,))
            try:
                db.execute('INSERT INTO nonces VALUES (?,?,?)', (who, nonce, now+120))
            except sqlite3.IntegrityError:
                raise MachineError(409, 'This machine request was already received.') from None
            if who == 'operator':
                result = self.operator(db, request, now)
            else:
                result = self.poll(db, who, request, now)
            db.commit()
        content = json.dumps(result, separators=(',', ':'), allow_nan=False)
        at = int(now)
        return {'time': at, 'nonce': nonce, 'payload': content,
                'signature': signature(key, 'REPLY', path, at, nonce, content)}

    def operator(self, db, request, now):
        action = request.get('action')
        if action == 'pair' and request.get('station') in ('1', '2', '3', '4'):
            station = request['station']
            return {'station': station, 'key': self.station_key(station)}
        if action == 'command':
            target, kind = request.get('target'), request.get('kind')
            if target not in ('all', '1', '2', '3', '4') or kind not in ('online', 'offline', 'auto', 'restart'):
                raise MachineError(422, 'Choose a station and a supported machine action.')
            for station in ('1', '2', '3', '4') if target == 'all' else (target,):
                command = {'id': secrets.token_hex(16), 'kind': kind, 'expires': int(now)+120}
                db.execute('INSERT INTO machines(station,command) VALUES (?,?) ON CONFLICT(station) DO UPDATE SET command=excluded.command', (station, json.dumps(command)))
        elif action != 'status':
            raise MachineError(422, 'Unsupported machine action.')
        rows = {}
        for station, status, seen, command in db.execute('SELECT station,status,last_seen,command FROM machines'):
            rows[station] = {'status': json.loads(status) if status else None, 'last_seen': seen,
                             'command': json.loads(command) if command else None}
        return {'stations': rows, 'server_time': int(now)}

    def poll(self, db, station, request, now):
        # Keep a small, typed status record. Never persist arbitrary host details.
        status = {}
        for key in ('mode', 'preference', 'ack', 'error', 'version'):
            value = request.get(key)
            if isinstance(value, str):
                status[key] = value[:240]
        for key in ('browser_running', 'internet', 'local_ready'):
            if type(request.get(key)) is bool:
                status[key] = request[key]
        db.execute('INSERT INTO machines(station,status,last_seen) VALUES (?,?,?) ON CONFLICT(station) DO UPDATE SET status=excluded.status,last_seen=excluded.last_seen', (station, json.dumps(status), now))
        row = db.execute('SELECT command FROM machines WHERE station=?', (station,)).fetchone()
        command = json.loads(row[0]) if row and row[0] else None
        if command and (command['expires'] < now or command['id'] == status.get('ack')):
            command = None
        return {'command': command}
