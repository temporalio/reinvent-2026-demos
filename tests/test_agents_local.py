"""Credential-free agent preview contracts; API guards are exercised in Docker."""
import importlib.util
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]
module = importlib.util.spec_from_file_location('local_agents', ROOT/'scripts/local/agents.py')
agents = importlib.util.module_from_spec(module)
module.loader.exec_module(agents)


class AgentPreviewTests(unittest.TestCase):
    def setUp(self):
        self.spec = yaml.safe_load((ROOT/'deploy/reinvent-2026.yaml').read_text())['spec']

    def test_no_provider_workers_or_inherited_credentials(self):
        services = {}
        metadata = agents.apply(services, self.spec, ROOT, ['agent-harness','agentic-sdlc'], 15101)
        self.assertEqual(set(metadata['availableDemos']), {'agent-harness','agentic-sdlc'})
        self.assertEqual(set(services), {'travel-web','sdlc-web','redis'})
        for name in ['travel-web','sdlc-web']:
            self.assertNotIn('env_file', services[name])
            env = services[name]['environment']
            self.assertEqual(env['LOCAL_PREVIEW'], '1')
            self.assertEqual(env['TEMPORAL_API_KEY'], '')
            self.assertEqual(env['TEMPORAL_ADDRESS'], 'temporal:7233')
        self.assertEqual(services['travel-web']['environment']['GEMINI_API_KEY'], '')
        self.assertEqual(services['sdlc-web']['environment']['GITHUB_TOKEN'], '')
        self.assertEqual(services['sdlc-web']['environment']['OPENAI_API_KEY'], '')
        self.assertEqual(services['sdlc-web']['environment']['GITHUB_SANDBOX_REPO'], 'local/preview-unconfigured')

    def test_sdlc_waits_for_local_redis_and_temporal(self):
        services = {}
        agents.apply(services, self.spec, ROOT, ['agentic-sdlc'], 15109)
        self.assertNotIn('ports', services['redis'])
        self.assertEqual(services['sdlc-web']['depends_on']['redis']['condition'], 'service_healthy')
        self.assertEqual(services['sdlc-web']['environment']['PUBLIC_URL'], 'http://localhost:15109/agentic-sdlc')
        self.assertIn('--root-path', services['sdlc-web']['entrypoint'])
