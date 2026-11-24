"""Native live-step excerpts must remain literal source, with valid highlight rows."""
import json
from pathlib import Path
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ExecutionExcerptTests(unittest.TestCase):
    def test_literal_source_and_focus(self):
        data = json.loads((ROOT / 'apps/launchpad/src/executionExcerpts.json').read_text())
        self.assertEqual(set(data), {'data-pipeline', 'loan', 'no-roads', 'agent-harness', 'agentic-sdlc'})
        for demo, variants in data.items():
            for variant, steps in variants.items():
                for step, excerpt in steps.items():
                    with self.subTest(demo=demo, variant=variant, step=step):
                        lines = (ROOT / excerpt['path']).read_text().splitlines()
                        code = textwrap.dedent('\n'.join(lines[excerpt['startLine']-1:excerpt['endLine']]))
                        self.assertEqual(code, excerpt['code'])
                        self.assertTrue(excerpt['focus'])
                        self.assertTrue(all(0 <= n < len(code.splitlines()) for n in excerpt['focus']))
