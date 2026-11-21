#!/usr/bin/env python3
"""Render a local Compose preview from the single production DemoProject."""
import argparse
import json
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]
GROUPS = {
    'tacos': ['tacos-web', 'tacos-api', 'tacos-worker'],
    'money-transfer': ['banking-web', 'banking-api', 'banking-worker'],
    'data-pipeline': ['pipeline-web', 'pipeline-worker'],
    'flight-simulator': ['flightsim-web'],
    'photo-booth': ['photobooth-web'],
}
MOTO = 'motoserver/moto:5.2.5@sha256:59a1965d845249b04def37a0e2565f9cc6c44543cb89b68e90f28f344b3b0d1a'

def render(apps, port=15101):
    spec = yaml.safe_load((ROOT / 'deploy/reinvent-2026.yaml').read_text())['spec']
    unknown = set(apps) - GROUPS.keys()
    if unknown:
        raise ValueError('No verified local adapter for: ' + ', '.join(sorted(unknown)))
    services = {
        'temporal': {
            'image': 'temporalio/temporal:1.8.3',
            'command': ['server', 'start-dev', '--ip', '0.0.0.0', '--db-filename', '/home/temporal/temporal.db', '--ui-public-path', '/_temporal/primary', '--ui-disable-news-fetch'],
            'volumes': ['temporal-data:/home/temporal'],
            'ports': ['127.0.0.1:17234:7233'],
            'healthcheck': {'test': ['CMD', 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], 'interval': '3s', 'timeout': '5s', 'retries': 40},
        },
        'moto': {
            'image': MOTO,
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
    selected = ['launchpad', 'gateway'] + [name for app in apps for name in GROUPS[app]]
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
        if name in spec['aws']['components']:
            env.update({'AWS_ACCESS_KEY_ID': 'local', 'AWS_SECRET_ACCESS_KEY': 'local', 'AWS_REGION': 'us-east-1', 'AWS_ENDPOINT_URL_S3': 'http://moto:5000', 'AWS_ENDPOINT_URL_DYNAMODB': 'http://moto:5000'})
            for key, bucket in spec['aws']['s3']['buckets'].items(): env[bucket['env']] = 'ri26-local-' + key
            service.setdefault('depends_on', {})['aws-seed'] = {'condition': 'service_completed_successfully'}
        env['UV_NO_SYNC'] = '1'
        service['environment'] = env
        if 'command' in component: service['entrypoint'] = component['command']
        elif 'args' in component: service['command'] = component['args']
        if name == 'gateway':
            service['ports'] = [f'127.0.0.1:{port}:8080']
            service['volumes'] = [str(ROOT / 'tmp/local/gateway.conf.template') + ':/etc/nginx/templates/default.conf.template:ro']
            service['depends_on'] = {'launchpad': {'condition': 'service_started'}, 'aws-seed': {'condition': 'service_completed_successfully'}, 'temporal-init': {'condition': 'service_completed_successfully'}}
        if name == 'launchpad':
            service['volumes'] = [str(ROOT / 'tmp/local/runtime-config.json') + ':/usr/share/nginx/html/runtime-config.json:ro']
        services[name] = service
    # nginx resolves these API hosts while loading its static config.
    for web, api in [('tacos-web','tacos-api'),('banking-web','banking-api')]:
        if web in services: services[web]['depends_on'] = {api: {'condition': 'service_started'}}
    volumes = {'temporal-data': {}}
    volumes.update({name+'-data': {} for name in ['flightsim-web','photobooth-web'] if name in services})
    return {'name': 'reinvent-2026-local', 'services': services, 'volumes': volumes}

def write(apps, port):
    target = ROOT / 'tmp/local'
    target.mkdir(parents=True, exist_ok=True)
    config = render(apps, port)
    (target / 'compose.yaml').write_text(yaml.safe_dump(config, sort_keys=False))
    gateway = (ROOT / 'apps/gateway/default.conf.template').read_text()
    gateway = gateway.replace('  location / {', '  location /_temporal/primary/ {\n    set $ui temporal:8233;\n    proxy_pass http://$ui;\n    proxy_set_header Host $http_host;\n  }\n  location / {')
    (target / 'gateway.conf.template').write_text(gateway)
    (target / 'runtime-config.json').write_text(json.dumps({'mode': 'local', 'availableDemos': apps, 'temporalUi': '/_temporal/primary/namespaces/default/workflows', 'notice': 'Local preview: Photo Booth uses mock images and saves email to a local outbox. AWS storage is emulated; Bedrock and Lambda are not.'}))
    print(target / 'compose.yaml')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apps', default=','.join(GROUPS))
    parser.add_argument('--port', type=int, default=15101)
    options = parser.parse_args()
    write(options.apps.split(','), options.port)
