"""Verify that live banking excerpts remain literal worker source."""
import json
from pathlib import Path
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]


class MoneyExcerptTests(unittest.TestCase):
    def test_excerpts_match_source(self):
        profiles = json.loads((ROOT / "apps/launchpad/src/moneyExcerpts.json").read_text())
        for profile, excerpts in profiles.items():
            for step, excerpt in excerpts.items():
                with self.subTest(profile=profile, step=step):
                    source = (ROOT / excerpt["path"]).read_text().splitlines()
                    fragment = "\n".join(source[excerpt["startLine"] - 1:excerpt["endLine"]])
                    self.assertEqual(textwrap.dedent(fragment), excerpt["code"])
