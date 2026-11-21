"""Local presentation adapters for demos hosted on Lambda."""
from copy import deepcopy

GROUPS = {'no-roads': ['no-roads-web'], 'loan': ['loan-web']}


def apply(services, spec, root, apps, port):
    """Add native No Roads execution and a provider-free Loan UI preview.

    The production DemoProject remains unchanged. ``services`` already contains
    each selected web component with its generic local Temporal environment.
    """
    if 'no-roads' in apps:
        web = services['no-roads-web']
        web['build'] = {
            'context': str(root / 'apps/no-roads'),
            'dockerfile': str(root / 'apps/no-roads/docker/local.Dockerfile'),
        }
        env = web.setdefault('environment', {})
        env.update({'NO_ROADS_EXECUTION_MODE': 'native', 'TEMPORAL_TLS': 'false', 'TEMPORAL_API_KEY': ''})
        worker = deepcopy(web)
        worker['entrypoint'] = ['/app/local-worker']
        worker.pop('ports', None)
        worker.pop('healthcheck', None)
        worker.pop('command', None)
        services['no-roads-local-worker'] = worker
        deployment = spec['components']['no-roads-worker']['serverless']['workerDeployment']
        services['no-roads-deployment-init'] = {
            'image': services['temporal']['image'],
            'entrypoint': ['/bin/sh', '/init-no-roads.sh'],
            'volumes': [str(root / 'scripts/local/init-no-roads.sh') + ':/init-no-roads.sh:ro'],
            'environment': {
                'TEMPORAL_ADDRESS': 'temporal:7233',
                'TEMPORAL_NAMESPACE': 'default',
                'TEMPORAL_API_KEY': '',
                'TEMPORAL_TLS': 'false',
                'LOCAL_DEPLOYMENT_NAME': deployment['deploymentName'],
                'LOCAL_BUILD_ID': deployment['buildId'],
            },
            'depends_on': {'no-roads-local-worker': {'condition': 'service_started'}},
        }
        services['gateway'].setdefault('depends_on', {})['no-roads-deployment-init'] = {'condition': 'service_completed_successfully'}
    if 'loan' in apps:
        env = services['loan-web'].setdefault('environment', {})
        env.update({
            'LOAN_PROVIDER_MODE': 'unavailable',
            'TEMPORAL_ENV': 'local',
            'TEMPORAL_LOCAL_ADDRESS': 'temporal:7233',
            'TEMPORAL_LOCAL_NAMESPACE': 'default',
            'AWS_EC2_METADATA_DISABLED': 'true',
            'AWS_ACCESS_KEY_ID': '',
            'AWS_SECRET_ACCESS_KEY': '',
            'AWS_SESSION_TOKEN': '',
        })
