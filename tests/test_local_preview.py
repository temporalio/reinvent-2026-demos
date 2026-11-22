import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.util.spec_from_file_location('local_compose', ROOT/'scripts/local/compose.py')
local = importlib.util.module_from_spec(loader)
loader.loader.exec_module(local)

class LocalPreviewTests(unittest.TestCase):
    def test_local_workers_do_not_inherit_cloud_auth_or_provider_secrets(self):
        config = local.render(list(local.GROUPS))
        for service in config['services'].values():
            env = service.get('environment', {})
            self.assertNotIn('env_file', service)
            if 'TEMPORAL_ADDRESS' in env:
                self.assertEqual(env['TEMPORAL_ADDRESS'], 'temporal:7233')
                self.assertEqual(env['TEMPORAL_API_KEY'], '')
                self.assertEqual(env['TEMPORAL_TLS'], 'false')
                self.assertFalse(env.get('OPENAI_API_KEY'))
                self.assertFalse(env.get('SENDGRID_API_KEY'))
        photo = config['services']['photobooth-web']['environment']
        self.assertEqual(photo['HOLODECK_IMAGE_PROVIDER'], 'mock')
        self.assertEqual(photo['HOLODECK_EMAIL_PROVIDER'], 'outbox')

    def test_every_exposed_port_is_loopback_and_data_survives_down(self):
        config = local.render(['tacos'])
        for service in config['services'].values():
            for port in service.get('ports', []):
                self.assertTrue(port.startswith('127.0.0.1:'))
        self.assertIn('temporal-data', config['volumes'])

    def test_all_nine_have_explicit_local_modes_and_unknown_apps_fail(self):
        services=local.render(list(local.GROUPS))['services']
        self.assertEqual(len(local.GROUPS),9)
        self.assertIn('no-roads-local-worker',services)
        self.assertIn('loan-web',services)
        self.assertIn('travel-web',services)
        self.assertIn('sdlc-web',services)
        for name in ['loan-worker','travel-worker','sdlc-worker-v1','sdlc-worker-v2']:
            self.assertNotIn(name,services)
        self.assertEqual(services['loan-web']['environment']['LOAN_PROVIDER_MODE'],'unavailable')
        with self.assertRaisesRegex(ValueError,'No verified local adapter'):
            local.render(['unknown-demo'])

    def test_commands_and_init_dependencies_are_preserved(self):
        services = local.render(['data-pipeline'])['services']
        self.assertEqual(services['pipeline-worker']['entrypoint'], ['python','worker.py'])
        self.assertEqual(services['pipeline-worker']['depends_on']['temporal-init']['condition'], 'service_completed_successfully')
        self.assertEqual(services['gateway']['depends_on']['aws-seed']['condition'], 'service_completed_successfully')
