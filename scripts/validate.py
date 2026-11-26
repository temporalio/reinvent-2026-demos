#!/usr/bin/env python3
"""Validate the monorepo handoff. Full Fieldkit validation is a separate required gate."""
import json
from pathlib import Path
import re
import subprocess
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
def validate():
    docs = list(yaml.safe_load_all((ROOT / 'deploy/reinvent-2026.yaml').read_text()))
    assert len(docs) == 1 and docs[0]['kind'] == 'DemoProject', 'Expected one combined DemoProject'
    spec = docs[0]['spec']
    assert spec['source']['repo'] == 'https://github.com/temporalio/reinvent-2026-demos'
    # Publishing workflow payloads (Photo Booth attendee emails included) was
    # reviewed and decided on November 21, 2026; turning it on needs that record.
    assert spec['temporal']['publicUI'] is False or 'publicUI is on (decided' in (ROOT / 'docs/DEPLOYMENT.md').read_text(), \
        'Attendee payload publication requires an explicit decision recorded in docs/DEPLOYMENT.md'
    assert '* @iandouglas' in (ROOT / '.github/CODEOWNERS').read_text()
    for name, build in spec['builds'].items():
        context = (ROOT / build['context']).resolve()
        recipe = (ROOT / build['dockerfile']).resolve()
        assert context.is_relative_to(ROOT) and context.is_dir(), name
        assert recipe.is_relative_to(ROOT) and recipe.is_file(), name
    for name, component in spec['components'].items():
        assert component['build'] in spec['builds'], name
        assert not any(e['name'] in {'OPENAI_API_KEY','GITHUB_TOKEN','TEMPORAL_API_KEY','SENDGRID_API_KEY'} and e.get('value') for e in component.get('env',[])), name
    catalog = json.loads((ROOT/'apps/launchpad/src/catalog.json').read_text())
    gateway=(ROOT/'apps/gateway/default.conf.template').read_text()
    for app in catalog:
        assert (ROOT/'apps'/app['id']).is_dir(), app['id']
        assert 'location '+app['path'] in gateway, app['id']
    page=(ROOT/'apps/launchpad/public/screensaver/index.html').read_text()
    assert '.marquee.bottom .marquee-track.is-running { animation-name: marquee-right; }' in page
    for logo in json.loads((ROOT/'apps/launchpad/src/customerLogos.json').read_text()):
        assert (ROOT/'apps/launchpad/public/assets/brand/customer-logos'/logo).is_file(), logo
    print(f'Monorepo structure passed: {len(catalog)} demos, {len(spec["builds"])} builds, one Fieldkit resource.')
    return spec

def scan():
    patterns = [re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
                re.compile(r'(?:AKIA|ASIA)[A-Z0-9]{16}'),
                re.compile(r'gh[pousr]_[A-Za-z0-9_]{36,}'),
                re.compile(r'github_pat_[A-Za-z0-9_]{60,}'),
                re.compile(r'sk-(?:proj-)?[A-Za-z0-9_-]{35,}')]
    hits=[]
    for folder in ['apps','deploy','.github','scripts','docs']:
        for path in (ROOT/folder).rglob('*'):
            if not path.is_file() or any(p in path.parts for p in ['node_modules','.venv','.git','__pycache__']):continue
            if path.name.startswith('.env') and path.name not in {'.env.example','.env.sample','.env.template'}:hits.append(str(path.relative_to(ROOT)));continue
            try: text=path.read_text()
            except (UnicodeDecodeError, OSError):continue
            if any(pattern.search(text) for pattern in patterns): hits.append(str(path.relative_to(ROOT)))
    if hits:
        raise ValueError('Review potential credentials in: '+', '.join(hits))
    print('Credential-pattern scan passed (not a guarantee of exhaustive secret detection).')

if __name__ == '__main__':
    validate()
    scan()
