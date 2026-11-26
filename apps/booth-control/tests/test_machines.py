"""Machine control never trusts the public date PIN or another station's key."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from machines import MachineError, Machines, signature


class MachineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.service = Machines(self.temp.name)
        self.counter = 0
        self.now = 1800000000

    def request(self, who, body, *, key=None, nonce=None, at=None):
        self.counter += 1
        path = '/control-api/machines/' + who
        key = key or (self.service.key if who == 'operator' else self.service.station_key(who))
        at = self.now if at is None else at
        nonce = nonce or f'{self.counter:032x}'
        payload = json.dumps(body)
        envelope = dict(time=at, nonce=nonce, payload=payload,
                        signature=signature(key, 'POST', path, at, nonce, payload))
        reply = self.service.handle(path, envelope, self.now)
        self.assertEqual(reply['signature'], signature(key, 'REPLY', path, reply['time'], nonce, reply['payload']))
        return json.loads(reply['payload'])

    def test_command_is_scoped_acknowledged_and_durable(self):
        self.request('operator', {'action': 'command', 'target': '3', 'kind': 'offline'})
        self.assertIsNone(self.request('2', {})['command'])
        command = self.request('3', {})['command']
        self.assertEqual(command['kind'], 'offline')
        self.service = Machines(self.temp.name)
        self.assertEqual(self.request('3', {})['command']['id'], command['id'])
        self.assertIsNone(self.request('3', {'ack': command['id'], 'mode': 'offline'})['command'])
        self.assertEqual(self.request('operator', {'action':'status'})['stations']['3']['status']['mode'], 'offline')

    def test_device_cannot_issue_operator_commands_or_impersonate_another_device(self):
        for who in ('operator', '2'):
            with self.assertRaises(MachineError) as caught:
                self.request(who, {'action':'command', 'target':'all', 'kind':'restart'}, key=self.service.station_key('1'))
            self.assertEqual(caught.exception.status, 401)

    def test_replay_and_expiry_are_rejected(self):
        nonce = 'a'*32
        self.request('1', {}, nonce=nonce)
        with self.assertRaises(MachineError) as caught:
            self.request('1', {}, nonce=nonce)
        self.assertEqual(caught.exception.status, 409)
        with self.assertRaises(MachineError):
            self.request('1', {}, at=self.now-61)
        self.request('operator', {'action':'command', 'target':'1', 'kind':'restart'})
        self.now += 121
        self.assertIsNone(self.request('1', {})['command'])

    def test_only_fixed_actions_are_accepted(self):
        with self.assertRaises(MachineError):
            self.request('operator', {'action':'command','target':'1','kind':'pkill Chrome'})
        self.request('operator', {'action':'command','target':'all','kind':'restart'})
        self.assertTrue(all(self.request(s,{})['command']['kind']=='restart' for s in ('1','2','3','4')))

    def test_http_requires_signed_native_access_and_same_origin_operator(self):
        import http.client
        import os
        import threading
        from unittest.mock import patch
        from server import ControlServer, Store
        with patch.dict(os.environ, {'CONTROL_MACHINE_CONTROL':'1'}):
            server = ControlServer(('127.0.0.1',0), Store(Path(self.temp.name)/'control.sqlite3'), clock=lambda:self.now)
        thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01},daemon=True)
        thread.start()
        try:
            port=server.server_address[1]
            def post(path, envelope, origin=None):
                connection=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
                headers={'Content-Type':'application/json'}
                if origin:headers['Origin']=origin
                connection.request('POST',path,json.dumps(envelope),headers)
                response=connection.getresponse();status=response.status;response.read();connection.close();return status
            self.assertEqual(post('/control-api/machines/1',{}),401)
            path='/control-api/machines/1';payload='{}';nonce='f'*32
            body=dict(time=self.now,nonce=nonce,payload=payload,signature=signature(server.machines.station_key('1'),'POST',path,self.now,nonce,payload))
            self.assertEqual(post(path,body),200)
            self.assertEqual(post('/control-api/machines/operator',{},origin='http://attacker.invalid'),403)
            self.assertEqual(post('/control-api/machines/operator',{},origin=f'http://127.0.0.1:{port}'),401)
        finally:
            server.shutdown();server.server_close();thread.join()

    def test_pairing_does_not_return_operator_key(self):
        pair = self.request('operator', {'action':'pair','station':'4'})
        self.assertEqual(pair['key'], self.service.station_key('4'))
        self.assertNotEqual(pair['key'], self.service.key)


class NetworkPairingTests(MachineTests):
    def issue(self, station='3', hub='http://127.0.0.1:15101'):
        return self.request('operator', {'action':'download','station':station,'hub':hub})

    def start(self, issued, code=None):
        from spake2 import SPAKE2_A
        exchange=SPAKE2_A((code or issued['code']).encode(),idA=('booth:'+issued['station']).encode(),idB=b'controller')
        nonce='b'*32
        reply=self.service.pairing(issued['station'],'start',{'message':exchange.start().hex(),'nonce':nonce},self.now)
        payload=json.loads(reply['payload'])
        key=exchange.finish(bytes.fromhex(payload['message']))
        return payload,key

    def finish(self, payload, key, proof=None, station=None):
        import hashlib,hmac
        proof=proof or hmac.new(key,f"PAIR-CLIENT\n{payload['session']}\n{payload['nonce']}".encode(),hashlib.sha256).hexdigest()
        return self.service.pairing(station or payload['station'],'finish',{'session':payload['session'],'proof':proof},self.now)

    def test_short_code_expiry_and_generated_key(self):
        import hashlib,hmac
        issued=self.issue()
        self.assertRegex(issued['code'],r'^[0-9]{6}$')
        self.assertEqual(issued['expires'],self.now+120)
        self.assertEqual(issued['attempts'],5)
        old=self.service.station_key('3')
        payload,key=self.start(issued)
        reply=self.finish(payload,key)
        expected=hmac.new(key,f"STATION-KEY\n3\n{payload['session']}".encode(),hashlib.sha256).hexdigest()
        self.assertEqual(self.service.station_key('3'),expected)
        self.assertNotEqual(old,expected)
        self.assertNotIn(expected,json.dumps(reply))
        self.assertEqual(set(json.loads(reply['payload'])),{'station','hub'})
        with self.assertRaises(MachineError):self.finish(payload,key)
        with self.assertRaises(MachineError):self.start(issued)
        with self.assertRaises(MachineError):self.request('3',{},key=old)
        self.assertIsNone(self.request('3',{},key=expected)['command'])

    def test_five_wrong_guesses_lock_even_across_restart(self):
        issued=self.issue()
        wrong='000000' if issued['code']!='000000' else '999999'
        old=self.service.station_key('3')
        for index in range(5):
            payload,key=self.start(issued,wrong)
            with self.assertRaises(MachineError):self.finish(payload,key)
            self.assertEqual(self.service.station_key('3'),old)
            if index==2:self.service=Machines(self.temp.name)
        with self.assertRaises(MachineError) as caught:self.start(issued)
        self.assertEqual(caught.exception.status,429)
        fresh=self.issue();payload,key=self.start(fresh);self.finish(payload,key)

    def test_invalid_request_counts_and_final_valid_attempt_can_finish(self):
        issued=self.issue()
        for _ in range(4):
            with self.assertRaises(MachineError):self.service.pairing('3','start',{},self.now)
        payload,key=self.start(issued)
        with self.assertRaises(MachineError):self.start(issued)
        self.finish(payload,key)

    def test_expiry_replacement_and_station_binding(self):
        issued=self.issue();payload,key=self.start(issued)
        with self.assertRaises(MachineError):self.finish(payload,key,station='2')
        self.issue()
        with self.assertRaises(MachineError):self.finish(payload,key)
        issued=self.issue();payload,key=self.start(issued)
        self.now+=120
        with self.assertRaises(MachineError):self.finish(payload,key)
        with self.assertRaises(MachineError):self.start(issued)

    def test_invalid_confirmation_cannot_be_retried(self):
        issued=self.issue();payload,key=self.start(issued)
        old=self.service.station_key('3')
        with self.assertRaises(MachineError):self.finish(payload,key,proof='0'*64)
        with self.assertRaises(MachineError):self.finish(payload,key)
        self.assertEqual(self.service.station_key('3'),old)

    def test_same_code_still_creates_independent_permanent_keys(self):
        from unittest.mock import patch
        with patch('machines.secrets.randbelow',return_value=123):
            issued=self.issue();self.assertEqual(issued['code'],'000123')
            payload,key=self.start(issued);self.finish(payload,key);first=self.service.station_key('3')
            issued=self.issue();payload,key=self.start(issued);self.finish(payload,key)
        self.assertNotEqual(first,self.service.station_key('3'))

    def test_real_fetch_client_derives_the_same_key(self):
        import importlib.util
        import threading
        from server import ControlServer,Store
        server=ControlServer(('127.0.0.1',0),Store(Path(self.temp.name)/'control.sqlite3'),clock=lambda:self.now)
        server.machines=self.service
        thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01},daemon=True);thread.start()
        # CI mounts the production fetch client into the hub test image.
        candidate=Path('/fetch_config.py')
        if not candidate.is_file():
            candidate=next((parent/'scripts/local/fetch_config.py' for parent in Path(__file__).resolve().parents if (parent/'scripts/local/fetch_config.py').is_file()),candidate)
        if not candidate.is_file():
            server.shutdown();server.server_close();thread.join();self.fail('Mount scripts/local/fetch_config.py at /fetch_config.py for this integration test.')
        spec=importlib.util.spec_from_file_location('fetch_config',candidate)
        client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)
        try:
            hub=f'http://127.0.0.1:{server.server_address[1]}'
            issued=self.issue(hub=hub)
            wrong='000000' if issued['code']!='000000' else '999999'
            with self.assertRaises(ValueError):client.fetch_pairing(hub,'3',wrong)
            formatted=issued['code'][:3]+'-'+issued['code'][3:]
            config=client.fetch_pairing(hub,'3',formatted)
            self.assertEqual(config,{'station':'3','hub':hub,'key':self.service.station_key('3')})
            with self.assertRaises(Exception):client.fetch_pairing(hub,'3',issued['code'])
        finally:
            server.shutdown();server.server_close();thread.join()


if __name__ == '__main__':
    unittest.main()
