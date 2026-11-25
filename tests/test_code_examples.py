"""Check editorial coverage and literal provenance of booth code examples."""
import json
from pathlib import Path
import re
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = {'python', 'go', 'java', 'typescript', 'dotnet', 'php', 'ruby', 'rust'}


class CodeExamplesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads((ROOT / 'apps/launchpad/public/booth/code-examples.json').read_text())

    def test_every_demo_has_eight_distinct_focused_examples(self):
        demos = self.payload['demos']
        catalog = json.loads((ROOT / 'apps/launchpad/src/catalog.json').read_text())
        self.assertEqual(set(demos), {demo['id'] for demo in catalog if demo.get('kind') != 'video'})
        self.assertEqual({language['id'] for language in self.payload['languages']}, LANGUAGES)
        self.assertEqual(len(self.payload['languages']), 8)
        for demo_id, demo in demos.items():
            with self.subTest(demo=demo_id):
                self.assertEqual(set(demo['examples']), LANGUAGES)
                self.assertIn(demo['nativeLanguage'], LANGUAGES)
                self.assertTrue(demo['summary'])
                self.assertEqual(len({e['code'] for e in demo['examples'].values()}), 8)
                for language, example in demo['examples'].items():
                    with self.subTest(language=language):
                        self.assertGreaterEqual(len(example['code'].splitlines()), 12)
                        self.assertLessEqual(len(example['code'].splitlines()), 35)
                        if language != demo['nativeLanguage']:
                            self.assertEqual(example['kind'], 'illustrative')
                            self.assertIn('Illustrative equivalent', example['note'])

    def test_native_examples_are_literal_source_excerpts(self):
        for demo_id, demo in self.payload['demos'].items():
            with self.subTest(demo=demo_id):
                source = demo['source']
                path = (ROOT / source['path']).resolve()
                self.assertTrue(path.is_relative_to(ROOT))
                lines = path.read_text().splitlines()
                excerpt = textwrap.dedent('\n'.join(lines[source['startLine'] - 1:source['endLine']])).strip()
                example = demo['examples'][demo['nativeLanguage']]
                self.assertEqual(example['kind'], 'native-excerpt')
                self.assertEqual(example['code'], excerpt)
                self.assertTrue(source['symbol'])

    def test_domain_concepts_survive_language_switching(self):
        # Semantic landmarks prevent replacing the examples with generic boilerplate.
        landmarks = {
            'money-transfer': ('deposit', 'withdraw'),
            'tacos': ('ready', 'capture'),
            'data-pipeline': ('extract', 'transform', 'load'),
            'loan': ('decision', 'assessment'),
            'no-roads': ('simulat', 'process'),
            'agentic-sdlc': ('test', 'feedback'),
            'flight-simulator': ('seq', 'score'),
            'photo-booth': ('compos', 'email'),
        }
        for demo_id, words in landmarks.items():
            for language, example in self.payload['demos'][demo_id]['examples'].items():
                with self.subTest(demo=demo_id, language=language):
                    normalized = re.sub(r'[^a-z]', '', example['code'].lower())
                    for word in words:
                        self.assertIn(word, normalized)
        for demo_id in ('loan', 'agent-harness'):
            self.assertIn('Python', self.payload['demos'][demo_id]['summary'])
            for language, example in self.payload['demos'][demo_id]['examples'].items():
                if language != 'python':
                    self.assertNotIn('code_mode_tool(', example['code'])
                    self.assertNotIn('TemporalAgent(', example['code'])


if __name__ == '__main__':
    unittest.main()
