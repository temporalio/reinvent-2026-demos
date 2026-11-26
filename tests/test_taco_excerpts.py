"""Keep live-phase excerpts tied to the actual demo implementation."""
import json
from pathlib import Path
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]


class TacoExcerptTests(unittest.TestCase):
    def test_excerpts_match_source(self):
        excerpts = json.loads((ROOT / "apps/launchpad/src/tacoExcerpts.json").read_text())
        source = (ROOT / "apps/tacos/workflows/python/src/dejavu_workflows/order_workflow.py").read_text().splitlines()
        for key, excerpt in excerpts.items():
            with self.subTest(phase=key):
                fragment = "\n".join(source[excerpt["startLine"] - 1:excerpt["endLine"]])
                self.assertEqual(textwrap.dedent(fragment), excerpt["code"])
