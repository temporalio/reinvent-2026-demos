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
from spake2 import SPAKE2_B


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
        self.pairing_sessions = {}
        with closing(sqlite3.connect(self.filename)) as db:
            db.execute('CREATE TABLE IF NOT EXISTS machines (station TEXT PRIMARY KEY, status TEXT, last_seen REAL, command TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS credentials (station TEXT PRIMARY KEY, secret TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS downloads (ticket TEXT PRIMARY KEY, station TEXT NOT NULL, hub TEXT NOT NULL, code TEXT NOT NULL, expires REAL NOT NULL)')
            if 'attempts' not in {row[1] for row in db.execute('PRAGMA table_info(downloads)')}:
                db.execute('ALTER TABLE downloads ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0')
            db.execute('DELETE FROM downloads WHERE length(code) != 6')
            db.execute('CREATE TABLE IF NOT EXISTS nonces (principal TEXT, nonce TEXT, expires REAL, PRIMARY KEY(principal,nonce))')
            db.commit()

    def station_key(self, station):
        with closing(sqlite3.connect(self.filename)) as db:
            row = db.execute('SELECT secret FROM credentials WHERE station=?', (station,)).fetchone()
        if row:
            return row[0]
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
        if action == 'download' and request.get('station') in ('1', '2', '3', '4'):
            from urllib.parse import urlsplit
            hub = request.get('hub', '')
            if not isinstance(hub, str):
                raise MachineError(422, 'Invalid download hub origin.')
            try:
                u = urlsplit(hub)
                if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment:
                    raise ValueError()
                _ = u.port
            except ValueError:
                raise MachineError(422, 'Invalid download hub origin.') from None
            code = f'{secrets.randbelow(1000000):06d}'
            ticket = secrets.token_hex(32)
            db.execute('DELETE FROM downloads WHERE station=? OR expires<?', (request['station'], now))
            db.execute('INSERT INTO downloads VALUES (?,?,?,?,?,0)', (ticket, request['station'], hub.rstrip('/'), code, now+120))
            return {'code': code, 'expires': int(now)+120, 'station': request['station'], 'attempts':5}
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

    def pairing(self, station, phase, body, now):
        """Confirm a short password with SPAKE2, never derive a key from it alone."""
        if station not in ('1','2','3','4'):
            raise MachineError(404, 'Unknown station.')
        with self.lock, closing(sqlite3.connect(self.filename)) as db:
            db.execute('BEGIN IMMEDIATE')
            self.pairing_sessions = {k:v for k,v in self.pairing_sessions.items() if v['expires'] > now}
            if phase == 'start':
                row = db.execute('SELECT ticket,hub,code,expires,attempts FROM downloads WHERE station=?', (station,)).fetchone()
                if not row or row[3] <= now:
                    raise MachineError(404, 'Pairing code expired or was used. Generate a new code on the controller.')
                ticket,hub,code,expires,attempts = row
                if attempts >= 5:
                    raise MachineError(429, 'Five pairing attempts used. Generate a fresh code on the controller.')
                # Commit before parsing/cryptography: malformed guesses and restarts
                # cannot roll back the limit. Each session permits one confirmation.
                db.execute('UPDATE downloads SET attempts=attempts+1 WHERE ticket=?', (ticket,))
                db.commit()
                message,nonce = body.get('message'),body.get('nonce')
                if (not isinstance(message,str) or not re.fullmatch('[a-f0-9]{66}',message)
                        or not isinstance(nonce,str) or not re.fullmatch('[a-f0-9]{32}',nonce)):
                    raise MachineError(401, 'Pairing request was not accepted.')
                exchange = SPAKE2_B(code.encode(), idA=('booth:'+station).encode(), idB=b'controller')
                outgoing = exchange.start()
                try:
                    key = exchange.finish(bytes.fromhex(message))
                except Exception:
                    raise MachineError(401, 'Pairing request was not accepted.') from None
                session = secrets.token_hex(16)
                self.pairing_sessions[session] = dict(key=key,station=station,ticket=ticket,hub=hub,nonce=nonce,expires=expires)
                payload = json.dumps(dict(session=session,station=station,hub=hub,nonce=nonce,message=outgoing.hex()),separators=(',',':'))
                return {'payload':payload,'signature':hmac.new(key,('PAIR-SERVER\n'+payload).encode(),hashlib.sha256).hexdigest()}
            session,proof = body.get('session'),body.get('proof')
            if not isinstance(session,str) or not re.fullmatch('[a-f0-9]{32}',session):
                raise MachineError(401, 'Pairing session was not accepted.')
            pending = self.pairing_sessions.get(session)
            if not pending or pending['station'] != station:
                raise MachineError(401, 'Pairing session expired. Try again with a fresh code.')
            del self.pairing_sessions[session]
            if not db.execute('SELECT 1 FROM downloads WHERE ticket=? AND expires>?', (pending['ticket'],now)).fetchone():
                raise MachineError(404, 'Pairing code expired or was used. Generate a new code on the controller.')
            key = pending['key']
            expected = hmac.new(key, f"PAIR-CLIENT\n{session}\n{pending['nonce']}".encode(),hashlib.sha256).hexdigest()
            if not isinstance(proof,str) or not re.fullmatch('[a-f0-9]{64}',proof) or not hmac.compare_digest(proof,expected):
                raise MachineError(401, 'Incorrect pairing code. Try again; at most five attempts are allowed.')
            station_key = hmac.new(key, f'STATION-KEY\n{station}\n{session}'.encode(),hashlib.sha256).hexdigest()
            db.execute('INSERT INTO credentials VALUES (?,?) ON CONFLICT(station) DO UPDATE SET secret=excluded.secret', (station,station_key))
            db.execute('DELETE FROM downloads WHERE ticket=?', (pending['ticket'],))
            db.commit()
            payload = json.dumps({'station':station,'hub':pending['hub']},separators=(',',':'))
            return {'payload':payload,'signature':hmac.new(key,('PAIR-FINISH\n'+payload).encode(),hashlib.sha256).hexdigest()}

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
