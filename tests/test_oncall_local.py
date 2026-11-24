"""Booth integration must preserve the on-call demo's runtime boundaries."""
import importlib.util
import json
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.util.spec_from_file_location('local', ROOT / 'scripts/local/compose.py')
local = importlib.util.module_from_spec(loader)
loader.loader.exec_module(local)


class OncallLocalTests(unittest.TestCase):
    def test_offline_adapter_uses_real_worker_with_explicit_stub_model(self):
        services = local.render(['agentcore-research'])['services']
        agent = services['oncall-agent']['environment']
        self.assertEqual(agent['AGENT_MODEL'], 'stub')
        self.assertEqual(agent['TEMPORAL_API_KEY'], '')
        self.assertEqual(agent['AWS_ACCESS_KEY_ID'], '')
        self.assertEqual(services['oncall-api']['environment']['WORKER_LOCATION'], 'local')
        self.assertIn('oncall-agent:8080/invocations', services['oncall-invoker']['environment']['AGENT_INVOKE_URL'])

    def test_hosted_api_refuses_execution_until_platform_supports_agentcore(self):
        spec = yaml.safe_load((ROOT / 'deploy/reinvent-2026.yaml').read_text())['spec']
        env = {item['name']: item.get('value') for item in spec['components']['oncall-api']['env']}
        self.assertEqual(env['ONCALL_EXECUTION_ENABLED'], 'false')
        self.assertNotIn('oncall-agent', spec['components'])

    def test_replacement_preserves_station_key_and_removes_old_name(self):
        catalog = json.loads((ROOT / 'apps/launchpad/src/catalog.json').read_text())
        demo = next(d for d in catalog if d['id'] == 'agentcore-research')
        self.assertEqual(demo['title'], 'AgentCore On-Call')
        self.assertEqual(demo['path'], '/agentcore-oncall/')
        self.assertEqual(demo['kind'], 'agentcore')
        for file in ['apps/launchpad/src/missionMetadata.ts', 'apps/launchpad/public/screensaver/index.html']:
            self.assertNotIn('Shubham', (ROOT / file).read_text())
