"""Booth availability and display settings, with durable revisions.

Local runs keep them in SQLite on a Docker volume (Store). The hosted hub keeps
them in the DynamoDB table Fieldkit provisions from spec.aws (DynamoStore,
selected by CONTROL_TABLE), because a container's own files do not survive a
restart or a rollout.
"""
from __future__ import annotations

from contextlib import closing, contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import hmac
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

DEMO_IDS = frozenset({
    'tacos', 'money-transfer', 'data-pipeline', 'loan', 'no-roads',
    'agent-harness', 'agentic-sdlc', 'flight-simulator', 'photo-booth', 'agentcore-video', 'agentcore-research',
})
STATION_IDS = ('1', '2', '3', '4')
DEFAULT_DISPLAY = {'width': 90, 'height': 78, 'x': 0, 'y': 0, 'zoom': 100, 'temporal_ui_zoom': 100}
DISPLAY_BOUNDS = {'width': (40, 100), 'height': (30, 100), 'x': (-7680, 7680), 'y': (-7680, 7680), 'zoom': (50, 150), 'temporal_ui_zoom': (70, 130)}
COOKIE_NAME = 'booth_control_session'
SESSION_SECONDS = 8 * 60 * 60
MAX_BODY_BYTES = 16 * 1024


class ApiError(Exception):
    def __init__(self, status, code, message, *, state=None, retry_after=None):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message
        self.state, self.retry_after = state, retry_after


def timestamp(now):
    return datetime.fromtimestamp(now, timezone.utc).isoformat().replace('+00:00', 'Z')


def default_config():
    return {
        'global': {'demo_enabled': {}, 'network_mode': 'online', 'display': dict(DEFAULT_DISPLAY)},
        'stations': {
            station: {'label': f'Mac Mini {station}', 'overrides': {'demo_enabled': {}},
                      'display': {}, 'last_seen': None}
            for station in STATION_IDS
        },
    }


def normalized_config(config):
    """Migrate old full station geometry into overrides, preserving custom values."""
    legacy = 'display' not in config['global']
    config['global']['display'] = {**DEFAULT_DISPLAY, **config['global'].get('display', {})}
    if legacy:
        for row in config['stations'].values():
            row['display'] = {key: value for key, value in row['display'].items()
                              if value != DEFAULT_DISPLAY.get(key)}
    return config


def public_config(config):
    config = normalized_config(config)
    for row in config['stations'].values():
        row['display_overrides'] = dict(row['display'])
        row['display'] = {**config['global']['display'], **row['display']}
    return config


def token_hash(token):
    return hashlib.sha256(token.encode('ascii')).hexdigest() if token else ''


class Store:
    """Serialize config/auth/presence transactions; keep presence outside revisions."""
    def __init__(self, filename):
        self.filename = str(filename)
        Path(self.filename).parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        with self.connection(write=True) as db:
            db.execute('CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS presence (station TEXT PRIMARY KEY, last_seen TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires REAL NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires)')
            db.execute('INSERT OR IGNORE INTO config VALUES (1, 0, ?)', (json.dumps(default_config()),))
        with closing(sqlite3.connect(self.filename)) as db:
            db.execute('PRAGMA journal_mode=WAL')

    @contextmanager
    def connection(self, *, write=False):
        with self.lock:
            db = sqlite3.connect(self.filename, timeout=10, isolation_level=None)
            try:
                db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise
            finally:
                db.close()

    @staticmethod
    def _cleanup(db, now):
        db.execute('DELETE FROM sessions WHERE expires <= ?', (now,))

    @staticmethod
    def _authenticated(db, token, now):
        return bool(token and db.execute('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?', (token_hash(token), now)).fetchone())

    def _snapshot(self, db, token, now):
        revision, payload = db.execute('SELECT revision,payload FROM config WHERE id=1').fetchone()
        result = public_config(json.loads(payload))
        for station, seen in db.execute('SELECT station,last_seen FROM presence'):
            if station in result['stations']:
                result['stations'][station]['last_seen'] = seen
        return {'revision': revision, **result, 'authenticated': self._authenticated(db, token, now), 'server_time': timestamp(now)}

    def state(self, token, now, station=None):
        with self.connection(write=True) as db:
            self._cleanup(db, now)
            if station:
                db.execute('INSERT INTO presence VALUES (?,?) ON CONFLICT(station) DO UPDATE SET last_seen=excluded.last_seen', (station, timestamp(now)))
            return self._snapshot(db, token, now)

    def login(self, token, old_token, now):
        with self.connection(write=True) as db:
            self._cleanup(db, now)
            if old_token:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash(old_token),))
            db.execute('INSERT INTO sessions VALUES (?,?)', (token_hash(token), now + SESSION_SECONDS))
            return self._snapshot(db, token, now)

    def logout(self, token, now):
        with self.connection(write=True) as db:
            self._cleanup(db, now)
            if token:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash(token),))
            return self._snapshot(db, '', now)

    def patch(self, revision, mutate, token, now):
        with self.connection(write=True) as db:
            self._cleanup(db, now)
            if not self._authenticated(db, token, now):
                raise ApiError(401, 'authentication_required', 'Enter the station PIN before saving settings.')
            current_revision, payload = db.execute('SELECT revision,payload FROM config WHERE id=1').fetchone()
            if revision != current_revision:
                raise ApiError(409, 'stale_revision', 'Settings changed elsewhere. Review the current settings before saving.', state=self._snapshot(db, token, now))
            config = normalized_config(json.loads(payload))
            updated = deepcopy(config)
            mutate(updated)
            if config != updated:
                db.execute('UPDATE config SET revision=revision+1,payload=? WHERE id=1', (json.dumps(updated, allow_nan=False),))
            return self._snapshot(db, token, now)


class StorageUnavailable(OSError):
    """The settings store could not be read or written."""


class DynamoStore:
    """Store's transactions on one DynamoDB table with string hash key pk.

    Items: pk "config" (revision, payload), "presence#<station>" (last_seen) and
    "session#<token hash>" (expires, plus expires_at for DynamoDB TTL). A save
    is a put conditioned on the revision it read, so concurrent saves have one
    winner, as Store's BEGIN IMMEDIATE gives locally.
    """
    def __init__(self, table, client):
        from botocore.exceptions import BotoCoreError, ClientError
        self.table, self.client = table, client
        self._errors, self._client_error = (BotoCoreError, ClientError), ClientError
        try:
            self._call('put_item', Item={'pk': {'S': 'config'}, 'revision': {'N': '0'}, 'payload': {'S': json.dumps(default_config())}},
                       ConditionExpression='attribute_not_exists(pk)')
        except _ConditionFailed:
            pass

    def _call(self, operation, **kwargs):
        try:
            return getattr(self.client, operation)(TableName=self.table, **kwargs)
        except self._client_error as error:
            if error.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
                raise _ConditionFailed() from None
            raise StorageUnavailable(f'DynamoDB {operation} on {self.table}: {error}') from error
        except self._errors as error:
            raise StorageUnavailable(f'DynamoDB {operation} on {self.table}: {error}') from error

    def _get(self, pk):
        return self._call('get_item', Key={'pk': {'S': pk}}, ConsistentRead=True).get('Item')

    def _config(self):
        item = self._get('config')
        if not item:
            raise StorageUnavailable(f'DynamoDB table {self.table} has no config item')
        return int(item['revision']['N']), item['payload']['S']

    def _authenticated(self, token, now):
        if not token:
            return False
        key = 'session#' + token_hash(token)
        item = self._get(key)
        if not item:
            return False
        if float(item['expires']['N']) <= now:
            # TTL deletes it eventually; do it now so it is gone at once.
            self._call('delete_item', Key={'pk': {'S': key}})
            return False
        return True

    def _snapshot(self, token, now):
        revision, payload = self._config()
        result = public_config(json.loads(payload))
        keys = [{'pk': {'S': 'presence#' + station}} for station in STATION_IDS]
        try:
            response = self.client.batch_get_item(RequestItems={self.table: {'Keys': keys, 'ConsistentRead': True}})
        except self._errors as error:
            raise StorageUnavailable(f'DynamoDB batch_get_item on {self.table}: {error}') from error
        for item in response.get('Responses', {}).get(self.table, []):
            station = item['pk']['S'].split('#', 1)[1]
            if station in result['stations']:
                result['stations'][station]['last_seen'] = item['last_seen']['S']
        return {'revision': revision, **result, 'authenticated': self._authenticated(token, now), 'server_time': timestamp(now)}

    def state(self, token, now, station=None):
        if station:
            self._call('put_item', Item={'pk': {'S': 'presence#' + station}, 'last_seen': {'S': timestamp(now)}})
        return self._snapshot(token, now)

    def login(self, token, old_token, now):
        if old_token:
            self._call('delete_item', Key={'pk': {'S': 'session#' + token_hash(old_token)}})
        expires = now + SESSION_SECONDS
        self._call('put_item', Item={'pk': {'S': 'session#' + token_hash(token)}, 'expires': {'N': repr(expires)}, 'expires_at': {'N': str(math.ceil(expires))}})
        return self._snapshot(token, now)

    def logout(self, token, now):
        if token:
            self._call('delete_item', Key={'pk': {'S': 'session#' + token_hash(token)}})
        return self._snapshot('', now)

    def patch(self, revision, mutate, token, now):
        if not self._authenticated(token, now):
            raise ApiError(401, 'authentication_required', 'Enter the station PIN before saving settings.')
        current_revision, payload = self._config()
        stale = ApiError(409, 'stale_revision', 'Settings changed elsewhere. Review the current settings before saving.')
        if revision != current_revision:
            stale.state = self._snapshot(token, now)
            raise stale
        config = normalized_config(json.loads(payload))
        updated = deepcopy(config)
        mutate(updated)
        if config != updated:
            try:
                self._call('put_item', Item={'pk': {'S': 'config'}, 'revision': {'N': str(current_revision + 1)}, 'payload': {'S': json.dumps(updated, allow_nan=False)}},
                           ConditionExpression='revision = :read', ExpressionAttributeValues={':read': {'N': str(current_revision)}})
            except _ConditionFailed:
                stale.state = self._snapshot(token, now)
                raise stale from None
        return self._snapshot(token, now)


class _ConditionFailed(Exception):
    """A DynamoDB conditional write lost to another write."""


class PinLimiter:
    """Coarse socket-peer limit; never trust a client-supplied forwarding header."""
    def __init__(self, limit=5, window=60):
        self.limit, self.window = limit, window
        self.failures = {}
        self.lock = threading.Lock()

    def check(self, peer, valid, now):
        with self.lock:
            # Bound memory even when many disconnected peers try once each.
            self.failures = {key: [value for value in values if value > now - self.window]
                             for key, values in self.failures.items() if any(value > now - self.window for value in values)}
            failures = self.failures.get(peer, [])
            if len(failures) >= self.limit:
                retry = max(1, math.ceil(self.window - (now - failures[0])))
                raise ApiError(429, 'pin_rate_limited', 'Too many PIN attempts. Try again shortly.', retry_after=retry)
            if valid:
                self.failures.pop(peer, None)
            else:
                self.failures[peer] = [*failures, now]


def object_fields(value, allowed, name):
    if not isinstance(value, dict):
        raise ApiError(422, 'invalid_settings', f'{name} must be an object.')
    if set(value) - set(allowed):
        raise ApiError(422, 'invalid_settings', f'{name} contains unsupported fields.')


def revision_of(body):
    revision = body.get('revision')
    if type(revision) is not int or revision < 0 or revision > 9007199254740991:
        raise ApiError(422, 'invalid_revision', 'A nonnegative integer revision is required.')
    return revision


def validate_demos(value):
    if not isinstance(value, dict) or set(value) - DEMO_IDS:
        raise ApiError(422, 'invalid_settings', 'Demo settings must name known demo IDs.')
    if any(item is not None and type(item) is not bool for item in value.values()):
        raise ApiError(422, 'invalid_settings', 'Demo settings must be true, false, or null to inherit.')


def apply_demos(target, patch):
    for name, value in patch.items():
        if value is None:
            target.pop(name, None)
        else:
            target[name] = value


def validate_display(display, *, inherit=False):
    object_fields(display, DISPLAY_BOUNDS, 'Display settings')
    for key, value in display.items():
        if inherit and value is None:
            continue
        low, high = DISPLAY_BOUNDS[key]
        if type(value) not in (int, float) or not low <= value <= high or not math.isfinite(value):
            raise ApiError(422, 'invalid_settings', f'{key} must be a finite number between {low} and {high}.')


def global_mutation(body):
    object_fields(body, {'revision', 'settings'}, 'Request')
    revision = revision_of(body)
    settings = body.get('settings')
    object_fields(settings, {'demo_enabled', 'network_mode', 'display'}, 'Global settings')
    if 'demo_enabled' in settings:
        validate_demos(settings['demo_enabled'])
    if 'network_mode' in settings and settings['network_mode'] not in ('online', 'offline'):
        raise ApiError(422, 'invalid_settings', 'Global network mode must be online or offline.')
    if 'display' in settings:
        validate_display(settings['display'])
    def mutate(config):
        target = config['global']
        target['display'].update(settings.get('display', {}))
        if 'demo_enabled' in settings:
            apply_demos(target['demo_enabled'], settings['demo_enabled'])
        if 'network_mode' in settings:
            target['network_mode'] = settings['network_mode']
    return revision, mutate


def station_mutation(body, station):
    object_fields(body, {'revision', 'overrides', 'display', 'label'}, 'Request')
    revision = revision_of(body)
    if not set(body) - {'revision'}:
        raise ApiError(422, 'invalid_settings', 'Provide station overrides, display settings, or a label.')
    if 'label' in body and (not isinstance(body['label'], str) or not 1 <= len(body['label'].strip()) <= 64):
        raise ApiError(422, 'invalid_settings', 'Station label must contain 1–64 characters.')
    overrides = body.get('overrides', {})
    object_fields(overrides, {'demo_enabled', 'network_mode'}, 'Station overrides')
    if 'demo_enabled' in overrides:
        validate_demos(overrides['demo_enabled'])
    if 'network_mode' in overrides and overrides['network_mode'] not in (None, 'online', 'offline'):
        raise ApiError(422, 'invalid_settings', 'Station network mode must be online, offline, or null to inherit.')
    display = body.get('display', {})
    validate_display(display, inherit=True)
    def mutate(config):
        target = config['stations'][station]
        if 'label' in body:
            target['label'] = body['label'].strip()
        if 'demo_enabled' in overrides:
            apply_demos(target['overrides']['demo_enabled'], overrides['demo_enabled'])
        if 'network_mode' in overrides:
            if overrides['network_mode'] is None:
                target['overrides'].pop('network_mode', None)
            else:
                target['overrides']['network_mode'] = overrides['network_mode']
        for key, value in display.items():
            if value is None:
                target['display'].pop(key, None)
            else:
                target['display'][key] = value
    return revision, mutate


def reject_constant(_value):
    raise ValueError('Non-finite JSON number')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key')
        result[key] = value
    return result


class ControlServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 32
    def __init__(self, address, store, *, timezone_name='America/Denver', clock=time.time):
        self.store, self.clock = store, clock
        self.pin_timezone = ZoneInfo(timezone_name)
        self.pin_limiter = PinLimiter()
        self.machines = None
        if os.environ.get('CONTROL_MACHINE_CONTROL') == '1' and isinstance(store, Store):
            from machines import Machines
            self.machines = Machines(Path(store.filename).parent)
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'BoothControl'
    sys_version = ''

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *_args):
        # Never log request bodies, Cookie headers, PINs, or session tokens.
        pass

    def json_response(self, status, payload, *, cookie=None, retry_after=None):
        body = json.dumps(payload, allow_nan=False, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        if retry_after:
            self.send_header('Retry-After', str(retry_after))
        self.end_headers()
        self.close_connection = True
        self.wfile.write(body)

    def fail(self, error):
        payload = {'error': error.code, 'message': error.message}
        if error.state is not None:
            payload['state'] = error.state
        self.json_response(error.status, payload, retry_after=error.retry_after)

    def session_token(self):
        try:
            cookie = SimpleCookie()
            cookie.load(self.headers.get('Cookie', ''))
            value = cookie[COOKIE_NAME].value if COOKIE_NAME in cookie else ''
            return value if re.fullmatch(r'[A-Za-z0-9_-]{32,128}', value) else ''
        except CookieError:
            return ''

    def require_origin(self):
        origin = self.headers.get('Origin', '')
        scheme = self.headers.get('X-Forwarded-Proto', 'http')
        host = self.headers.get('Host', '')
        try:
            parsed = urlsplit(origin)
            target = urlsplit(f'{scheme}://{host}')
            if scheme not in ('http', 'https') or parsed.scheme != scheme or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
                raise ValueError()
            def authority(url):
                if not url.hostname or any(character.isspace() for character in url.netloc):
                    raise ValueError()
                return url.hostname.lower(), url.port or (443 if url.scheme == 'https' else 80)
            if target.username or target.password or target.path or target.query or target.fragment or authority(parsed) != authority(target):
                raise ValueError()
        except ValueError:
            raise ApiError(403, 'origin_rejected', 'Use this station’s same-origin control panel to save settings.') from None
        return scheme

    def read_body(self):
        if self.headers.get('Transfer-Encoding'):
            raise ApiError(400, 'invalid_body', 'Chunked request bodies are not accepted.')
        length = self.headers.get('Content-Length')
        if length is None:
            raise ApiError(411, 'length_required', 'Content-Length is required.')
        try:
            length = int(length)
        except ValueError:
            raise ApiError(400, 'invalid_body', 'Content-Length must be an integer.') from None
        if length < 0:
            raise ApiError(400, 'invalid_body', 'Content-Length must not be negative.')
        if length > MAX_BODY_BYTES:
            raise ApiError(413, 'body_too_large', 'The settings request is too large.')
        if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
            raise ApiError(415, 'json_required', 'Content-Type must be application/json.')
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError()
            body = json.loads(raw.decode('utf-8'), parse_constant=reject_constant, object_pairs_hook=unique_object)
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, 'invalid_json', 'Provide one valid JSON settings object.') from None
        if not isinstance(body, dict):
            raise ApiError(400, 'invalid_json', 'Provide one JSON settings object.')
        return body

    def do_GET(self):
        try:
            url = urlsplit(self.path)
            if url.path in ('/healthz', '/control-api/healthz') and not url.query:
                self.json_response(200, {'ok': True})
                return
            if url.path != '/control-api/state':
                raise ApiError(404, 'not_found', 'Control route not found.')
            query = parse_qs(url.query, keep_blank_values=True)
            if set(query) - {'station'} or ('station' in query and len(query['station']) != 1):
                raise ApiError(400, 'invalid_station', 'Provide at most one station ID.')
            station = query.get('station', [None])[0]
            if station is not None and station not in STATION_IDS:
                raise ApiError(422, 'invalid_station', 'Station must be 1, 2, 3, or 4.')
            self.json_response(200, self.server.store.state(self.session_token(), self.server.clock(), station))
        except ApiError as error:
            self.fail(error)
        except (OSError, sqlite3.Error):
            self.fail(ApiError(503, 'storage_unavailable', 'Settings storage is unavailable. Try again shortly.'))

    def do_POST(self):
        if self.path.startswith('/control-api/machines/'):
            self.machine_request()
        else:
            self.write_request('POST')

    def machine_request(self):
        from machines import MachineError
        service = getattr(self.server, 'machines', None)
        if service is None:
            self.fail(ApiError(404, 'not_enabled', 'Machine control is available on the laptop LAN hub only.'))
            return
        try:
            # Operator requests originate in the laptop's same-origin UI; signed
            # native polls intentionally need no browser cookie or Origin header.
            if self.path == '/control-api/machines/operator':
                self.require_origin()
            envelope = self.read_body()
            self.json_response(200, service.handle(self.path, envelope, self.server.clock()))
        except MachineError as error:
            self.fail(ApiError(error.status, 'machine_control', error.message))
        except ApiError as error:
            self.fail(error)
        except (OSError, sqlite3.Error):
            self.fail(ApiError(503, 'storage_unavailable', 'Machine control storage is unavailable.'))

    def do_PATCH(self):
        self.write_request('PATCH')

    def do_OPTIONS(self):
        self.fail(ApiError(405, 'method_not_allowed', 'Cross-origin control requests are not supported.'))

    def write_request(self, method):
        try:
            scheme = self.require_origin()
            body = self.read_body()
            path = urlsplit(self.path)
            if path.query or path.fragment:
                raise ApiError(400, 'invalid_route', 'Control write routes do not accept query parameters.')
            now, token = self.server.clock(), self.session_token()
            if method == 'POST' and path.path == '/control-api/login':
                object_fields(body, {'pin'}, 'Login')
                pin = body.get('pin')
                expected = datetime.fromtimestamp(now, self.server.pin_timezone).strftime('%m%d')
                valid = isinstance(pin, str) and bool(re.fullmatch(r'[0-9]{4}', pin)) and hmac.compare_digest(pin, expected)
                self.server.pin_limiter.check(self.client_address[0], valid, now)
                if not valid:
                    raise ApiError(401, 'invalid_pin', 'That PIN was not accepted.')
                new_token = secrets.token_urlsafe(32)
                state = self.server.store.login(new_token, token, now)
                cookie = f'{COOKIE_NAME}={new_token}; Path=/control-api; HttpOnly; SameSite=Strict; Max-Age={SESSION_SECONDS}' + ('; Secure' if scheme == 'https' else '')
                self.json_response(200, state, cookie=cookie)
                return
            if method == 'POST' and path.path == '/control-api/logout':
                object_fields(body, set(), 'Logout')
                state = self.server.store.logout(token, now)
                self.json_response(200, state, cookie=f'{COOKIE_NAME}=; Path=/control-api; HttpOnly; SameSite=Strict; Max-Age=0' + ('; Secure' if scheme == 'https' else ''))
                return
            if method == 'PATCH' and path.path == '/control-api/global':
                revision, mutate = global_mutation(body)
            elif method == 'PATCH' and re.fullmatch(r'/control-api/stations/[1-4]', path.path):
                revision, mutate = station_mutation(body, path.path[-1])
            else:
                raise ApiError(404, 'not_found', 'Control route not found.')
            self.json_response(200, self.server.store.patch(revision, mutate, token, now))
        except ApiError as error:
            self.fail(error)
        except (OSError, sqlite3.Error):
            self.fail(ApiError(503, 'storage_unavailable', 'Settings storage is unavailable. Try again shortly.'))


def make_store():
    table = os.environ.get('CONTROL_TABLE', '').strip()
    if not table:
        return Store(os.environ.get('CONTROL_DB', '/data/control.sqlite3'))
    import boto3
    from botocore.config import Config
    # Region and credentials come from the environment (Fieldkit sets
    # AWS_REGION; EKS Pod Identity supplies the credentials). Short timeouts:
    # the launchpad gives up on a request after 4 seconds.
    config = Config(connect_timeout=2, read_timeout=3, retries={'mode': 'standard', 'max_attempts': 2})
    return DynamoStore(table, boto3.client('dynamodb', config=config))


def main():
    store = make_store()
    server = ControlServer(
        (os.environ.get('CONTROL_LISTEN_ADDRESS', '127.0.0.1'), int(os.environ.get('CONTROL_PORT', '8090'))),
        store, timezone_name=os.environ.get('CONTROL_TIMEZONE', 'America/Denver'),
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
