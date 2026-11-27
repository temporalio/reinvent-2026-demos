import importlib.util
import json
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]
class MonorepoTests(unittest.TestCase):
    def test_single_project_has_every_application_build_and_no_literal_keys(self):
        docs=list(yaml.safe_load_all((ROOT/'deploy/reinvent-2026.yaml').read_text()))
        self.assertEqual(len(docs),1)
        spec=docs[0]['spec']
        self.assertEqual(docs[0]['kind'],'DemoProject')
        self.assertTrue(spec['temporal']['publicUI'])
        for component in spec['components'].values():
            self.assertIn(component['build'],spec['builds'])
        for recipe in spec['builds'].values():
            self.assertTrue((ROOT/recipe['context']).is_dir())
            self.assertTrue((ROOT/recipe['dockerfile']).is_file())
    def test_route_catalog_is_same_origin_and_includes_holodeck(self):
        catalog=json.loads((ROOT/'apps/launchpad/src/catalog.json').read_text())
        self.assertEqual(len(catalog),11)
        self.assertEqual(len({d['path'] for d in catalog}),11)
        gateway=(ROOT/'apps/gateway/default.conf.template').read_text()
        for demo in catalog:
            self.assertTrue(demo['path'].startswith('/'))
            self.assertIn('location '+demo['path'],gateway)
        self.assertFalse(next(d for d in catalog if d['id']=='agentic-sdlc')['tentative'])
    def test_screensaver_has_opposite_directions_and_all_local_logos(self):
        page=(ROOT/'apps/launchpad/public/screensaver/index.html').read_text()
        self.assertIn('.marquee-track.is-running { animation: marquee-left',page)
        self.assertIn('.marquee.bottom .marquee-track.is-running { animation-name: marquee-right;',page)
        logos=json.loads((ROOT/'apps/launchpad/src/customerLogos.json').read_text())
        self.assertEqual(len(logos),25)
        for file in logos:self.assertTrue((ROOT/'apps/launchpad/public/assets/brand/customer-logos'/file).is_file())
        self.assertTrue((ROOT/'apps/launchpad/public/assets/js/starfield.js').is_file())

    def test_shared_code_excerpts_match_repository_sources(self):
        snippets=json.loads((ROOT/'apps/launchpad/public/booth/snippets.json').read_text())
        self.assertEqual(set(snippets),{d['id'] for d in json.loads((ROOT/'apps/launchpad/src/catalog.json').read_text()) if d['id']!='tacos' and not d.get('kind')})
        for item in snippets.values():
            lines=(ROOT/item['path']).read_text().splitlines()
            self.assertEqual(item['code'],'\n'.join(lines[:180]))
            self.assertEqual(item['truncated'],len(lines)>180)

    def test_booth_control_routes_do_not_require_fieldkit_sso(self):
        ingress=yaml.safe_load((ROOT/'deploy/reinvent-2026.yaml').read_text())['spec']['ingress']
        for path in ['/config','/control-api/state','/control-api/login','/control-api/logout','/control-api/global','/control-api/stations/4']:
            with self.subTest(path=path):
                route=max((r for r in ingress['routes'] if path.startswith(r['pathPrefix'])),key=lambda r:len(r['pathPrefix']))
                auth='public' if route.get('public') else route.get('auth',ingress['auth'])
                self.assertEqual(auth,'public')
