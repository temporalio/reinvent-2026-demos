"""Exercise the real HTTP API, SQLite and DynamoDB persistence, and concurrent writes."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
import http.client
from http.cookies import SimpleCookie
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

from botocore.exceptions import ClientError

from server import COOKIE_NAME, ControlServer, DEFAULT_DISPLAY, DynamoStore, MAX_BODY_BYTES, SESSION_SECONDS, Store, StorageUnavailable


class Clock:
    def __init__(self):
        self.value = datetime(2026, 11, 30, 18, tzinfo=timezone.utc).timestamp()

    def __call__(self):
        return self.value


class ControlHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / 'control.sqlite3'
        self.clock = Clock()
        self.start_server()
        self.addCleanup(self.stop_server)

    def start_server(self):
        self.server = ControlServer(('127.0.0.1', 0), self.make_store(), clock=self.clock)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def make_store(self):
        return Store(self.database)

    def session_hashes(self):
        with closing(sqlite3.connect(self.database)) as db:
            return [row[0] for row in db.execute('SELECT token_hash FROM sessions')]

    def stop_server(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.thread.join(timeout=3)
            self.server = None

    def request(self, method, path, body=None, *, cookie=None, origin=True, headers=None):
        request_headers = dict(headers or {})
        if method != 'GET' and origin is not False:
            request_headers.setdefault('Origin', f'http://127.0.0.1:{self.port}' if origin is True else origin)
        if cookie:
            request_headers['Cookie'] = cookie
        if body is not None:
            data = body if isinstance(body, str) else json.dumps(body)
            request_headers.setdefault('Content-Type', 'application/json')
        else:
            data = None
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=4)
        try:
            connection.request(method, path, body=data, headers=request_headers)
            response = connection.getresponse()
            payload = json.loads(response.read())
            return response.status, payload, dict(response.getheaders())
        finally:
            connection.close()

    def login(self, *, pin='1130'):
        status, state, headers = self.request('POST', '/control-api/login', {'pin': pin})
        self.assertEqual(status, 200, state)
        self.assertTrue(state['authenticated'])
        parsed = SimpleCookie()
        parsed.load(headers['Set-Cookie'])
        return f'{COOKIE_NAME}={parsed[COOKIE_NAME].value}'

    def test_workflow_zoom_is_station_specific_and_survives_restart(self):
        cookie = self.login()
        status, state, _ = self.request('PATCH', '/control-api/stations/2', {
            'revision': 0, 'display': {'temporal_ui_zoom': 80},
        }, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(state['stations']['2']['display']['temporal_ui_zoom'], 80)
        self.assertEqual(state['stations']['2']['display']['zoom'], 100)
        self.assertEqual(state['stations']['1']['display']['temporal_ui_zoom'], 100)
        self.stop_server()
        self.start_server()
        status, restored, _ = self.request('GET', '/control-api/state?station=2')
        self.assertEqual(status, 200)
        self.assertEqual(restored['stations']['2']['display']['temporal_ui_zoom'], 80)
        for value in (69, 131, True, '80'):
            self.assertEqual(self.request('PATCH', '/control-api/stations/2', {
                'revision': 1, 'display': {'temporal_ui_zoom': value},
            }, cookie=cookie)[0], 422)

    def test_old_display_records_get_default_zoom_without_losing_geometry(self):
        store = self.server.store
        store.login('zoom-test', None, self.clock())
        def legacy(config):
            for row in config['stations'].values():
                row['display'].pop('temporal_ui_zoom')
            config['stations']['3']['display']['width'] = 82
        store.patch(0, legacy, 'zoom-test', self.clock())
        self.stop_server()
        self.start_server()
        status, state, _ = self.request('GET', '/control-api/state?station=3')
        self.assertEqual(status, 200)
        self.assertEqual(state['revision'], 1)
        self.assertEqual(state['stations']['3']['display']['width'], 82)
        self.assertEqual(state['stations']['3']['display']['temporal_ui_zoom'], 100)

    def test_defaults_presence_and_no_cors(self):
        status, state, headers = self.request('GET', '/control-api/state?station=1')
        self.assertEqual(status, 200)
        self.assertEqual(state['revision'], 0)
        self.assertFalse(state['authenticated'])
        self.assertEqual(state['global'], {'demo_enabled': {}, 'network_mode': 'online'})
        self.assertEqual(set(state['stations']), {'1', '2', '3', '4'})
        self.assertEqual(state['stations']['1']['display'], DEFAULT_DISPLAY)
        self.assertEqual(state['stations']['1']['last_seen'], state['server_time'])
        self.assertIsNone(state['stations']['2']['last_seen'])
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertFalse(any(name.lower().startswith('access-control-') for name in headers))
        self.clock.value += 5
        _, changed, _ = self.request('GET', '/control-api/state?station=2')
        self.assertEqual(changed['revision'], 0)
        self.assertIsNotNone(changed['stations']['2']['last_seen'])
        self.assertEqual(self.request('GET', '/healthz')[1], {'ok': True})

    def test_daily_pin_uses_denver_date(self):
        # UTC November 30 is still November 29 in Denver.
        self.clock.value = datetime(2026, 11, 30, 2, tzinfo=timezone.utc).timestamp()
        self.assertEqual(self.request('POST', '/control-api/login', {'pin': '1130'})[0], 401)
        self.login(pin='1129')

    def test_cookie_attributes_logout_expiry_and_cleanup(self):
        status, state, headers = self.request('POST', '/control-api/login', {'pin': '1130'})
        self.assertEqual(status, 200)
        for attribute in ['HttpOnly', 'SameSite=Strict', 'Path=/control-api', f'Max-Age={SESSION_SECONDS}']:
            self.assertIn(attribute, headers['Set-Cookie'])
        self.assertNotIn('Secure', headers['Set-Cookie'])
        cookie = headers['Set-Cookie'].split(';')[0]
        self.assertTrue(self.request('GET', '/control-api/state', cookie=cookie)[1]['authenticated'])
        self.clock.value += SESSION_SECONDS + 1
        self.assertFalse(self.request('GET', '/control-api/state', cookie=cookie)[1]['authenticated'])
        self.assertEqual(self.session_hashes(), [])
        # A fresh login is on the same local date after this eight-hour advance.
        cookie = self.login()
        status, state, headers = self.request('POST', '/control-api/logout', {}, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertFalse(state['authenticated'])
        self.assertIn('Max-Age=0', headers['Set-Cookie'])
        self.assertFalse(self.request('GET', '/control-api/state', cookie=cookie)[1]['authenticated'])

    def test_origin_required_and_forwarded_host_scheme_supported(self):
        self.assertEqual(self.request('POST', '/control-api/login', {'pin': '1130'}, origin=False)[0], 403)
        self.assertEqual(self.request('POST', '/control-api/login', {'pin': '1130'}, origin='http://other.invalid')[0], 403)
        status, _, headers = self.request('POST', '/control-api/login', {'pin': '1130'}, origin='https://station.local', headers={'Host': 'station.local', 'X-Forwarded-Proto': 'https'})
        self.assertEqual(status, 200)
        self.assertIn('; Secure', headers['Set-Cookie'])
        self.assertEqual(self.request('POST', '/control-api/login', {'pin': '1130'}, origin='https://station.local', headers={'Host': 'station.local', 'X-Forwarded-Proto': 'http'})[0], 403)

    def test_agentcore_availability_can_be_saved_for_each_station(self):
        cookie = self.login()
        status, state, _ = self.request('PATCH', '/control-api/global', {
            'revision': 0, 'settings': {'demo_enabled': {'agentcore-video': False, 'agentcore-research': True}},
        }, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertFalse(state['global']['demo_enabled']['agentcore-video'])
        status, state, _ = self.request('PATCH', '/control-api/stations/4', {
            'revision': 1, 'overrides': {'demo_enabled': {'agentcore-video': True, 'agentcore-research': False}},
        }, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(state['stations']['4']['overrides']['demo_enabled'], {'agentcore-video': True, 'agentcore-research': False})
        self.assertEqual(state['stations']['1']['overrides']['demo_enabled'], {})

    def test_authenticated_overrides_and_inheritance(self):
        request = {'revision': 0, 'settings': {'demo_enabled': {'photo-booth': False}, 'network_mode': 'offline'}}
        self.assertEqual(self.request('PATCH', '/control-api/global', request)[0], 401)
        cookie = self.login()
        status, state, _ = self.request('PATCH', '/control-api/global', request, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(state['revision'], 1)
        status, state, _ = self.request('PATCH', '/control-api/stations/1', {
            'revision': 1, 'overrides': {'demo_enabled': {'photo-booth': True}, 'network_mode': 'online'},
            'display': {'width': 82, 'height': 70, 'x': -50, 'y': 100, 'zoom': 125}, 'label': '  Camera station  ',
        }, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertFalse(state['global']['demo_enabled']['photo-booth'])
        self.assertTrue(state['stations']['1']['overrides']['demo_enabled']['photo-booth'])
        self.assertEqual(state['stations']['1']['label'], 'Camera station')
        self.assertEqual(state['stations']['1']['display']['x'], -50)
        status, state, _ = self.request('PATCH', '/control-api/stations/1', {
            'revision': 2, 'overrides': {'demo_enabled': {'photo-booth': None}, 'network_mode': None},
        }, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(state['stations']['1']['overrides'], {'demo_enabled': {}})
        status, state, _ = self.request('PATCH', '/control-api/global', {'revision': 3, 'settings': {'demo_enabled': {'photo-booth': None}}}, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(state['global']['demo_enabled'], {})
        self.assertEqual(state['stations']['2']['display'], DEFAULT_DISPLAY)
        # Presence does not make a subsequent config save stale.
        self.request('GET', '/control-api/state?station=4')
        self.assertEqual(self.request('PATCH', '/control-api/global', {'revision': 4, 'settings': {'network_mode': 'online'}}, cookie=cookie)[0], 200)

    def test_stale_writes_and_noop_revision(self):
        cookie = self.login()
        first = {'revision': 0, 'settings': {'network_mode': 'offline'}}
        self.assertEqual(self.request('PATCH', '/control-api/global', first, cookie=cookie)[1]['revision'], 1)
        status, conflict, _ = self.request('PATCH', '/control-api/global', first, cookie=cookie)
        self.assertEqual(status, 409)
        self.assertEqual(conflict['error'], 'stale_revision')
        self.assertEqual(conflict['state']['revision'], 1)
        status, same, _ = self.request('PATCH', '/control-api/global', {'revision': 1, 'settings': {'network_mode': 'offline'}}, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(same['revision'], 1)

    def test_competing_http_writes_have_one_winner(self):
        cookie = self.login()
        def save(station):
            return self.request('PATCH', f'/control-api/stations/{station}', {'revision': 0, 'label': f'Concurrent {station}'}, cookie=cookie)[0]
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(save, ['1', '2']))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(self.request('GET', '/control-api/state')[1]['revision'], 1)

    def test_durable_restart_keeps_config_session_and_presence(self):
        cookie = self.login()
        self.request('GET', '/control-api/state?station=3')
        self.request('PATCH', '/control-api/stations/3', {'revision': 0, 'display': {'y': 250}}, cookie=cookie)
        self.stop_server()
        self.start_server()
        status, state, _ = self.request('GET', '/control-api/state', cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(state['revision'], 1)
        self.assertEqual(state['stations']['3']['display']['y'], 250)
        self.assertIsNotNone(state['stations']['3']['last_seen'])
        self.assertTrue(state['authenticated'])
        (saved_hash,) = self.session_hashes()
        self.assertNotIn(cookie.split('=', 1)[1], saved_hash)

    def test_strict_schema_and_bounds_reject_partial_writes(self):
        cookie = self.login()
        invalid = [
            {'revision': True, 'display': {'width': 90}},
            {'revision': 0, 'label': ' '},
            {'revision': 0, 'label': 'x' * 65},
            {'revision': 0, 'display': {'width': 39}},
            {'revision': 0, 'display': {'height': 101}},
            {'revision': 0, 'display': {'zoom': 151}},
            {'revision': 0, 'display': {'x': 7681}},
            {'revision': 0, 'display': {'width': True}},
            {'revision': 0, 'display': {'width': '90'}},
            {'revision': 0, 'display': {'width': 10 ** 1000}},
            {'revision': 0, 'display': {'zoom': 100}, 'unknown': 1},
            {'revision': 0, 'overrides': {'demo_enabled': {'unknown': True}}},
            {'revision': 0, 'overrides': {'demo_enabled': {'tacos': 1}}},
            {'revision': 0, 'overrides': {'network_mode': 'automatic'}},
        ]
        for body in invalid:
            with self.subTest(body=body):
                self.assertEqual(self.request('PATCH', '/control-api/stations/1', body, cookie=cookie)[0], 422)
        for raw in ['{"revision":0,"display":{"width":NaN}}', '{"revision":0,"revision":1}', '[]']:
            self.assertEqual(self.request('PATCH', '/control-api/stations/1', raw, cookie=cookie)[0], 400)
        self.assertEqual(self.request('GET', '/control-api/state')[1]['revision'], 0)

    def test_pin_rate_limit_ignores_spoofed_client_ips(self):
        for index in range(5):
            self.assertEqual(self.request('POST', '/control-api/login', {'pin': '0000'}, headers={'X-Real-IP': f'192.0.2.{index}'})[0], 401)
        status, error, headers = self.request('POST', '/control-api/login', {'pin': '1130'}, headers={'X-Real-IP': '192.0.2.99'})
        self.assertEqual(status, 429)
        self.assertEqual(error['error'], 'pin_rate_limited')
        self.assertGreater(int(headers['Retry-After']), 0)
        self.clock.value += 61
        self.login()

    def test_body_limits_route_validation_and_content_type(self):
        self.assertEqual(self.request('POST', '/control-api/login', '{}', headers={'Content-Length': str(MAX_BODY_BYTES + 1)})[0], 413)
        self.assertEqual(self.request('POST', '/control-api/login', '{}', headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request('GET', '/control-api/state?station=5')[0], 422)
        self.assertEqual(self.request('GET', '/control-api/state?station=1&station=2')[0], 400)
        self.assertEqual(self.request('PATCH', '/control-api/stations/5', {'revision': 0})[0], 404)
        self.assertEqual(self.request('GET', '/missing')[0], 404)
        self.assertEqual(self.request('OPTIONS', '/control-api/login')[0], 405)


if __name__ == '__main__':
    unittest.main()


class FakeDynamo:
    """The DynamoDB client calls DynamoStore makes, on one in-memory table.

    It enforces the two condition expressions DynamoStore writes with, so the
    concurrency and first-start behavior is the real store's.
    """
    def __init__(self, table='control'):
        self.table, self.items, self.lock = table, {}, threading.Lock()
        self.fail = None

    def _check(self, TableName):
        if self.fail:
            raise ClientError({'Error': {'Code': self.fail, 'Message': 'injected'}}, 'call')
        assert TableName == self.table, TableName

    def get_item(self, TableName, Key, ConsistentRead=False):
        self._check(TableName)
        with self.lock:
            item = self.items.get(Key['pk']['S'])
            return {'Item': json.loads(json.dumps(item))} if item else {}

    def put_item(self, TableName, Item, ConditionExpression=None, ExpressionAttributeValues=None):
        self._check(TableName)
        with self.lock:
            current = self.items.get(Item['pk']['S'])
            if ConditionExpression == 'attribute_not_exists(pk)':
                ok = current is None
            elif ConditionExpression == 'revision = :read':
                ok = current is not None and current['revision'] == ExpressionAttributeValues[':read']
            else:
                assert ConditionExpression is None, ConditionExpression
                ok = True
            if not ok:
                raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException', 'Message': 'condition'}}, 'PutItem')
            self.items[Item['pk']['S']] = json.loads(json.dumps(Item))
        return {}

    def delete_item(self, TableName, Key):
        self._check(TableName)
        with self.lock:
            self.items.pop(Key['pk']['S'], None)
        return {}

    def batch_get_item(self, RequestItems):
        (table, request), = RequestItems.items()
        self._check(table)
        with self.lock:
            found = [json.loads(json.dumps(self.items[k['pk']['S']])) for k in request['Keys'] if k['pk']['S'] in self.items]
        return {'Responses': {table: found}}


class DynamoControlHttpTests(ControlHttpTests):
    """The same HTTP behavior with the hosted DynamoDB store; a restart keeps the table."""
    def setUp(self):
        self.dynamo = FakeDynamo()
        super().setUp()

    def make_store(self):
        return DynamoStore('control', self.dynamo)

    def session_hashes(self):
        return [pk.split('#', 1)[1] for pk in self.dynamo.items if pk.startswith('session#')]

    def test_sessions_carry_a_ttl_attribute(self):
        self.login()
        (item,) = [v for k, v in self.dynamo.items.items() if k.startswith('session#')]
        self.assertEqual(int(item['expires_at']['N']), int(self.clock.value) + SESSION_SECONDS)

    def test_storage_errors_are_503_not_crashes(self):
        self.dynamo.fail = 'ProvisionedThroughputExceededException'
        status, payload, _ = self.request('GET', '/control-api/state?station=1')
        self.assertEqual(status, 503)
        self.assertEqual(payload['error'], 'storage_unavailable')

    def test_a_second_start_keeps_the_saved_config(self):
        cookie = self.login()
        self.request('PATCH', '/control-api/global', {'revision': 0, 'settings': {'network_mode': 'offline'}}, cookie=cookie)
        DynamoStore('control', self.dynamo)  # another replica or a restart
        self.assertEqual(self.request('GET', '/control-api/state')[1]['global']['network_mode'], 'offline')

    def test_unreachable_table_at_start_is_visible(self):
        self.dynamo.fail = 'ResourceNotFoundException'
        with self.assertRaises(StorageUnavailable) as raised:
            DynamoStore('control', self.dynamo)
        self.assertIn('control', str(raised.exception))
