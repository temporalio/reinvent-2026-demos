"""Check demo labels and collision scopes without loading provider SDKs."""
import ast
import hashlib
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]


def function(path, name, namespace):
    tree = ast.parse((ROOT / path).read_text())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), path, 'exec'), namespace)
    return namespace[name]


class WorkflowPrefixTests(unittest.TestCase):
    def test_holodeck_labels_preserve_station_and_session(self):
        for app in ('photo-booth', 'flight-simulator'):
            factory = function(f'apps/{app}/backend/holodeck/temporal_client.py', 'wf_id', {'settings': SimpleNamespace(station='mac1')})
            self.assertEqual(factory('photobooth', 'abc123'), 'photobooth-mac1-abc123')
            self.assertEqual(factory('flight', 'abc123'), 'flightsim-mac1-abc123')
            self.assertNotEqual(factory('flight', 'abc123', 'mac1'), factory('flight', 'abc123', 'mac2'))

    def test_travel_owner_and_queue_stay_distinct(self):
        namespace = {'config': SimpleNamespace(TASK_QUEUE='mac1'), 'hashlib': hashlib}
        factory = function('apps/agent-harness/agent_harness_demo/web.py', 'prefix_for', namespace)
        self.assertTrue(factory('alice').startswith('travelagent-mac1.'))
        self.assertNotEqual(factory('alice'), factory('sam'))
        first = factory('alice')
        namespace['config'].TASK_QUEUE = 'mac2'
        self.assertNotEqual(first, factory('alice'))

    def test_sdlc_scope_and_legacy_visibility(self):
        namespace = {}
        prefix = function('apps/agentic-sdlc/agentic_sdlc/config.py', 'runs_prefix', namespace)
        query = function('apps/agentic-sdlc/agentic_sdlc/config.py', 'runs_query', namespace)
        self.assertEqual(prefix('mac1--s01'), 'agenticsdlc-mac1--s01.gh.')
        self.assertNotEqual(prefix('mac1--s01'), prefix('mac1--s02'))
        self.assertIn("WorkflowId STARTS_WITH 'agenticsdlc-mac1--s01.gh.'", query('mac1--s01'))
        self.assertIn("WorkflowId STARTS_WITH 'mac1--s01.gh.'", query('mac1--s01'))
