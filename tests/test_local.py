"""Control hub persistence, LAN opt-in, and upstream validation contracts."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('control_local_compose', ROOT / 'scripts/local/compose.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


class ControlLocalGenerationTests(unittest.TestCase):
    def test_control_hub_is_present_without_any_selected_demo(self):
        config = local.render([])
        hub = config['services']['control-hub']
        self.assertEqual(hub['environment']['CONTROL_DB'], '/data/control.sqlite3')
        self.assertEqual(hub['environment']['CONTROL_TIMEZONE'], 'America/Denver')
        self.assertEqual(hub['volumes'], ['control-data:/data'])
        # Hosted, the hub uses the spec.aws DynamoDB table; locally it stays on SQLite.
        self.assertNotIn('CONTROL_TABLE', hub['environment'])
        self.assertNotIn('AWS_ENDPOINT_URL_DYNAMODB', hub['environment'])
        self.assertNotIn('ports', hub)
        self.assertIn('control-data', config['volumes'])
        self.assertEqual(config['services']['gateway']['environment']['CONTROL_HUB_URL'], 'http://control-hub:8090')

    def test_controller_has_no_demo_workers_or_host_services(self):
        config = local.render([],bind_address='0.0.0.0',controller=True)
        self.assertEqual(set(config['services']), {'gateway','launchpad','control-hub'})
        self.assertEqual(set(config['volumes']), {'control-data'})
        self.assertIn('127.0.0.1:15102:8082',config['services']['gateway']['ports'])
        self.assertEqual(config['services']['control-hub']['mem_limit'],'256m')

    def test_only_gateway_can_opt_into_lan(self):
        config = local.render(['tacos'], port=15119, bind_address='0.0.0.0')
        self.assertEqual(config['services']['gateway']['ports'], ['0.0.0.0:15119:8080', '127.0.0.1:15102:8082'])
        self.assertEqual(config['services']['temporal']['ports'], ['127.0.0.1:17234:7233'])
        self.assertEqual(config['services']['moto']['ports'], ['127.0.0.1:15001:5000'])
        default = local.render(['tacos'])
        self.assertEqual(default['services']['gateway']['ports'], ['127.0.0.1:15101:8080'])
        with self.assertRaises(ValueError):
            local.render([], bind_address='0.0.0.0:8080')

    def test_remote_hub_still_keeps_a_local_persistent_instance(self):
        config = local.render([], hub_url='http://192.168.50.10:15101/')
        self.assertEqual(config['services']['gateway']['environment']['CONTROL_HUB_URL'], 'http://192.168.50.10:15101')
        self.assertEqual(config['services']['control-hub']['volumes'], ['control-data:/data'])
        self.assertEqual(config['services']['gateway']['depends_on']['control-hub']['condition'], 'service_healthy')

    def test_invalid_hub_urls_cannot_inject_nginx_configuration(self):
        for value in ['http://host\n', 'http://ho\tst', 'http://host;return200', 'http://host"',
                      'ftp://host', 'http://user:password@host', 'http://host/control-api',
                      'http://host?key=secret', 'http://host#fragment', 'http://host:0',
                      'http://host:-1', 'http://host:65536', 'http://host:']:
            with self.subTest(value=repr(value)), self.assertRaises(ValueError):
                local.control_hub_url(value)
        self.assertEqual(local.control_hub_url('https://hub.example:443'), 'https://hub.example:443')
        self.assertEqual(local.control_hub_url('http://[::1]:15101/'), 'http://[::1]:15101')

    def test_gateway_template_change_recreates_only_gateway(self):
        from unittest.mock import patch
        first=local.render([],bind_address='0.0.0.0',controller=True)
        again=local.render([],bind_address='0.0.0.0',controller=True)
        self.assertEqual(first,again)
        template=local.gateway_template(True)
        with patch.object(local,'gateway_template',return_value=template+'\n# changed route'):
            updated=local.render([],bind_address='0.0.0.0',controller=True)
        self.assertNotEqual(first['services']['gateway']['environment']['LOCAL_GATEWAY_CONFIG_SHA256'],updated['services']['gateway']['environment']['LOCAL_GATEWAY_CONFIG_SHA256'])
        for name in ('control-hub','launchpad'):
            self.assertEqual(first['services'][name],updated['services'][name])
