#!/usr/bin/env python3
"""Render a local Compose preview from the single production DemoProject."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
import yaml

ROOT = Path(__file__).resolve().parents[2]
GROUPS = {
    'tacos': ['tacos-web', 'tacos-api', 'tacos-worker'],
    'money-transfer': ['banking-web', 'banking-api', 'banking-worker'],
    'data-pipeline': ['pipeline-web', 'pipeline-worker'],
    'flight-simulator': ['flightsim-web'],
    'photo-booth': ['photobooth-web'],
}
def load_adapter(name):
    module_spec = importlib.util.spec_from_file_location('preview_' + name, ROOT / 'scripts/local' / (name + '.py'))
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module

SERVERLESS = load_adapter('serverless')
AGENTS = load_adapter('agents')
ONCALL = load_adapter('oncall')
GROUPS.update(SERVERLESS.GROUPS)
GROUPS.update({'agent-harness': [], 'agentic-sdlc': [], 'agentcore-research': []})
NOTICES = {
    'no-roads': 'Local native worker: backlog and concurrency are real; AWS Lambda scaling is not emulated.',
    'loan': 'Presentation preview: Bedrock inference and loan decisions are unavailable until a provider is configured.',
    'agent-harness': 'Presentation preview: model inference is disabled.',
    'agentic-sdlc': 'Presentation preview: GitHub actions and model inference are disabled.',
    'photo-booth': 'Local mock images and email outbox; no real image inference or email delivery.',
}

MOTO = 'motoserver/moto:5.2.5@sha256:59a1965d845249b04def37a0e2565f9cc6c44543cb89b68e90f28f344b3b0d1a'

DEFAULT_CONTROL_HUB_URL = 'http://control-hub:8090'


def control_hub_url(value):
    """Only accept a base HTTP(S) origin; never interpolate nginx directives."""
    if not re.fullmatch(r'[A-Za-z0-9:/\[\].-]+', value):
        raise ValueError('CONTROL_HUB_URL must not contain whitespace, controls, or nginx syntax')
    parsed = urlsplit(value)
    if (parsed.scheme not in {'http', 'https'} or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.path not in {'', '/'} or parsed.query or parsed.fragment
            or not re.fullmatch(r'[A-Za-z0-9.:-]+', parsed.hostname)):
        raise ValueError('CONTROL_HUB_URL must be an HTTP(S) origin with no credentials, path, or query')
    try:
        port = parsed.port
        if port is not None and port < 1:
            raise ValueError('port must be positive')
        if parsed.netloc.endswith(':'):
            raise ValueError('port is empty')
    except ValueError as error:
        raise ValueError('CONTROL_HUB_URL has an invalid port') from error
    return value.rstrip('/')


def render(apps, port=15101, bind_address='127.0.0.1', hub_url=DEFAULT_CONTROL_HUB_URL):
    if bind_address not in {'127.0.0.1', '0.0.0.0'}:
        raise ValueError('BOOTH_BIND_ADDRESS must be 127.0.0.1 or 0.0.0.0')
    hub_url = control_hub_url(hub_url)

    spec = yaml.safe_load((ROOT / 'deploy/reinvent-2026.yaml').read_text())['spec']
    unknown = set(apps) - GROUPS.keys()
    if unknown:
        raise ValueError('No verified local adapter for: ' + ', '.join(sorted(unknown)))
    services = {
        'temporal': {
            'image': 'temporalio/temporal:1.8.3',
            'restart': 'unless-stopped',
            'command': ['server', 'start-dev', '--ip', '0.0.0.0', '--db-filename', '/home/temporal/temporal.db', '--ui-public-path', '/_temporal/primary', '--ui-disable-news-fetch'],
            'volumes': ['temporal-data:/home/temporal'],
            'ports': ['127.0.0.1:17234:7233'],
            'healthcheck': {'test': ['CMD', 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], 'interval': '3s', 'timeout': '5s', 'retries': 40},
        },
        'moto': {
            'image': MOTO,
            'restart': 'unless-stopped',
            'environment': {'MOTO_PORT': '5000'},
            'ports': ['127.0.0.1:15001:5000'],
            'healthcheck': {'test': ['CMD', 'python', '-c', "import urllib.request; urllib.request.urlopen('http://localhost:5000/moto-api/')"], 'interval': '3s', 'timeout': '5s', 'retries': 30},
        },
        'aws-seed': {
            'image': MOTO,
            'entrypoint': ['python', '-c'],
            'command': ["import boto3; s=boto3.client('s3',endpoint_url='http://moto:5000',region_name='us-east-1',aws_access_key_id='local',aws_secret_access_key='local'); " + '; '.join(f"s.create_bucket(Bucket='ri26-local-{key}')" for key in spec['aws']['s3']['buckets'])],
            'depends_on': {'moto': {'condition': 'service_healthy'}},
        },
        'temporal-init': {
            'image': 'temporalio/temporal:1.8.3',
            'entrypoint': ['/bin/sh', '/init-temporal.sh'],
            'volumes': [str(ROOT / 'scripts/local/init-temporal.sh') + ':/init-temporal.sh:ro'],
            'depends_on': {'temporal': {'condition': 'service_healthy'}},
        },
    }
    selected = ['launchpad', 'gateway', 'control-hub'] + [name for app in apps for name in GROUPS[app]]
    for name in selected:
        component = spec['components'][name]
        recipe = spec['builds'][component['build']]
        context = (ROOT / recipe['context']).resolve()
        dockerfile = (ROOT / recipe['dockerfile']).resolve()
        service = {'build': {'context': str(context), 'dockerfile': str(dockerfile)}, 'init': True}
        env = {e['name']: str(e['value']) for e in component.get('env', []) if 'value' in e}
        if component.get('worker') or component.get('temporalAccess'):
            env.update({
                'TEMPORAL_ADDRESS': 'temporal:7233', 'TEMPORAL_ENDPOINT': 'temporal:7233',
                'TEMPORAL_HOST_URL': 'temporal:7233', 'TEMPORAL_NAMESPACE': 'default',
                'TEMPORAL_API_KEY': '', 'TEMPORAL_TLS': 'false', 'TEMPORAL_ENV': 'local',
                'TEMPORAL_LOCAL_ADDRESS': 'temporal:7233', 'TEMPORAL_LOCAL_NAMESPACE': 'default',
                'TEMPORAL_UI_URL': f'http://localhost:{port}/_temporal/primary',
                'TEMPORAL_UI_NAMESPACE': 'default', 'AWS_EC2_METADATA_DISABLED': 'true',
            })
            service['depends_on'] = {'temporal-init': {'condition': 'service_completed_successfully'}}
        if name == 'photobooth-web' or name == 'flightsim-web':
            env.update({'HOLODECK_IMAGE_PROVIDER': 'mock', 'HOLODECK_LLM_PROVIDER': 'mock', 'HOLODECK_EMAIL_PROVIDER': 'outbox', 'HOLODECK_PUBLIC_BASE_URL': f'http://localhost:{port}' + env['PUBLIC_PATH']})
            service['volumes'] = [f'{name}-data:/data']
        # The hosted hub's DynamoDB table (spec.aws) is not emulated: local
        # runs keep the hub on SQLite in the control-data volume.
        if name in spec['aws']['components'] and name != 'control-hub':
            env.update({'AWS_ACCESS_KEY_ID': 'local', 'AWS_SECRET_ACCESS_KEY': 'local', 'AWS_REGION': 'us-east-1', 'AWS_ENDPOINT_URL_S3': 'http://moto:5000', 'AWS_ENDPOINT_URL_DYNAMODB': 'http://moto:5000'})
            for key, bucket in spec['aws']['s3']['buckets'].items(): env[bucket['env']] = 'ri26-local-' + key
            service.setdefault('depends_on', {})['aws-seed'] = {'condition': 'service_completed_successfully'}
        env['UV_NO_SYNC'] = '1'
        service['environment'] = env
        if 'command' in component: service['entrypoint'] = component['command']
        elif 'args' in component: service['command'] = component['args']
        if name == 'gateway':
            service['ports'] = [f'{bind_address}:{port}:8080']
            env['CONTROL_HUB_URL'] = hub_url
            service['volumes'] = [str(ROOT / 'tmp/local/gateway.conf.template') + ':/etc/nginx/templates/default.conf.template:ro']
            service['depends_on'] = {'launchpad': {'condition': 'service_started'}, 'aws-seed': {'condition': 'service_completed_successfully'}, 'temporal-init': {'condition': 'service_completed_successfully'}, 'control-hub': {'condition': 'service_healthy'}}
        if name == 'control-hub':
            env['CONTROL_DB'] = '/data/control.sqlite3'
            env['CONTROL_MACHINE_CONTROL'] = '1'
            service['volumes'] = ['control-data:/data']
            service['healthcheck'] = {'test': ['CMD', 'python', '-c', "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/healthz')"], 'interval': '3s', 'timeout': '3s', 'retries': 30}
        if name == 'launchpad':
            service['volumes'] = [str(ROOT / 'tmp/local/runtime-config.json') + ':/usr/share/nginx/html/runtime-config.json:ro']
        service['restart'] = 'unless-stopped'
        services[name] = service
    # nginx resolves these API hosts while loading its static config.
    for web, api in [('tacos-web','tacos-api'),('banking-web','banking-api')]:
        if web in services: services[web]['depends_on'] = {api: {'condition': 'service_started'}}
    SERVERLESS.apply(services, spec, ROOT, apps, port)
    AGENTS.apply(services, spec, ROOT, apps, port)
    ONCALL.apply(services, spec, ROOT, apps, port)
    for name, service in services.items():
        if name not in {'aws-seed', 'temporal-init', 'no-roads-deployment-init'}:
            service.setdefault('restart', 'unless-stopped')
    volumes = {'temporal-data': {}, 'control-data': {}}
    volumes.update({name+'-data': {} for name in ['flightsim-web','photobooth-web'] if name in services})
    return {'name': 'reinvent-2026-local', 'services': services, 'volumes': volumes}

def write(apps, port, bind_address='127.0.0.1', hub_url=DEFAULT_CONTROL_HUB_URL):
    target = ROOT / 'tmp/local'
    target.mkdir(parents=True, exist_ok=True)
    config = render(apps, port, bind_address, hub_url)
    (target / 'compose.yaml').write_text(yaml.safe_dump(config, sort_keys=False))
    gateway = (ROOT / 'apps/gateway/default.conf.template').read_text()
    gateway = gateway.replace('  location / {', '  location /_temporal/primary/ {\n    set $ui temporal:8233;\n    proxy_pass http://$ui;\n    proxy_set_header Host $http_host;\n  }\n  location / {')
    (target / 'gateway.conf.template').write_text(gateway)
    (target / 'runtime-config.json').write_text(json.dumps({'mode': 'local', 'availableDemos': apps, 'demoNotices': {key: value for key, value in NOTICES.items() if key in apps}, 'temporalUi': '/_temporal/primary/namespaces/default/workflows', 'notice': 'Local preview: Photo Booth uses mock images and saves email to a local outbox. AWS storage is emulated; Bedrock and Lambda are not.'}))
    print(target / 'compose.yaml')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apps', default=','.join(GROUPS))
    parser.add_argument('--port', type=int, default=15101)
    parser.add_argument('--bind-address', choices=['127.0.0.1', '0.0.0.0'], default='127.0.0.1')
    parser.add_argument('--control-hub-url', default=DEFAULT_CONTROL_HUB_URL)
    options = parser.parse_args()
    write(options.apps.split(','), options.port, options.bind_address, options.control_hub_url)
