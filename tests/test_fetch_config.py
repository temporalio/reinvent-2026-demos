import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

p=Path(__file__).resolve().parents[1]/'scripts/local/fetch_config.py'
spec=importlib.util.spec_from_file_location('fetch_client',p)
client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)


class FetchConfigTests(unittest.TestCase):
    def test_ip_number_and_explicit_origins(self):
        self.assertEqual(client.origin('192.168.86.108'),'http://192.168.86.108:15101')
        self.assertEqual(client.origin('192.168.86.108:15119'),'http://192.168.86.108:15119')
        self.assertEqual(client.origin('https://controller.example'),'https://controller.example')
        for value in ('http:/bad','http://user:pass@host','http://host/path'):
            with self.assertRaises(ValueError):client.origin(value)

    def test_rejects_unverified_configuration(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def read(self,*_):return b'{"nonce":"wrong","payload":"{}","signature":"0"}'
        class Opener:
            def open(self,*_,**__):return Response()
        with patch.object(client.urllib.request,'build_opener',return_value=Opener()):
            with self.assertRaises(ValueError):client.fetch_pairing('192.168.86.108','3','123456')

    def test_gateway_rejection_is_not_reported_as_expired_code(self):
        self.assertIn('controller gateway',client.http_error_message(403))
        self.assertNotIn('expired',client.http_error_message(403))
        self.assertIn('Five pairing attempts',client.http_error_message(429))
        self.assertIn('expired or was used',client.http_error_message(404))
        self.assertNotIn('expired',client.http_error_message(500))
