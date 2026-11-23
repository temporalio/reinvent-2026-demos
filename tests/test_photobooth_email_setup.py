"""Secret setup never places values in argv or discards existing properties."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('email_setup',ROOT/'scripts/setup/configure-photobooth-email.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class PhotoBoothEmailSetupTests(unittest.TestCase):
    def test_secret_is_sent_on_stdin_and_existing_properties_survive(self):
        calls=[]
        def run(args,**kwargs):
            calls.append((args,kwargs))
            return SimpleNamespace(returncode=0,stdout=json.dumps({'SecretString':json.dumps({'preserve':'yes'})}) if len(calls)==1 else '{}')
        module.update_email_secret('test-private-value','booth@temporal.test',secret_id='fieldkit/reinvent-2026/email',region='us-west-1',run=run)
        self.assertNotIn('test-private-value',str([args for args,_ in calls]))
        self.assertEqual(json.loads(calls[1][1]['input']),{'preserve':'yes','SENDGRID_API_KEY':'test-private-value','HOLODECK_EMAIL_FROM':'booth@temporal.test'})
    def test_placeholder_key_is_rejected_before_aws(self):
        with self.assertRaises(ValueError):
            module.update_email_secret('TODO','booth@temporal.test',secret_id='unused',region='us-west-1')
