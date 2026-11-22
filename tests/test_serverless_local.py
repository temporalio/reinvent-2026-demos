"""Local serverless presentation must not imply hosted Lambda/model execution."""
import copy
import importlib.util
from pathlib import Path
import os
import unittest
from unittest.mock import patch

import yaml

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    # Dataclasses resolve their defining module while processing annotations.
    import sys
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


adapter = load('serverless_adapter', 'scripts/local/serverless.py')
loan_shared = load('loan_shared_local_tests', 'apps/loan/shared.py')


class ServerlessLocalTests(unittest.TestCase):
    def test_native_worker_is_explicit_and_preserves_hosted_definition(self):
        spec = yaml.safe_load((ROOT / 'deploy/reinvent-2026.yaml').read_text())['spec']
        original = copy.deepcopy(spec)
        services = {
            'temporal': {'image': 'temporalio/temporal:1.8.3'},
            'gateway': {},
            'no-roads-web': {'environment': {'TEMPORAL_TASK_QUEUE': 'ri26-no-roads'}},
            'loan-web': {'environment': {}},
        }
        adapter.apply(services, spec, ROOT, ['no-roads', 'loan'], 15101)
        self.assertEqual(spec, original)
        worker = services['no-roads-local-worker']
        self.assertEqual(worker['entrypoint'], ['/app/local-worker'])
        self.assertEqual(worker['environment']['NO_ROADS_EXECUTION_MODE'], 'native')
        self.assertEqual(worker['environment']['TEMPORAL_API_KEY'], '')
        init = services['no-roads-deployment-init']['environment']
        self.assertEqual(init['LOCAL_DEPLOYMENT_NAME'], spec['components']['no-roads-worker']['serverless']['workerDeployment']['deploymentName'])
        self.assertEqual(services['loan-web']['environment']['LOAN_PROVIDER_MODE'], 'unavailable')
        self.assertNotIn('loan-worker', services)

    def test_local_loan_never_inherits_cloud_auth(self):
        with patch.dict(os.environ, {'TEMPORAL_ENV': 'local', 'TEMPORAL_LOCAL_ADDRESS': 'temporal:7233', 'TEMPORAL_LOCAL_NAMESPACE': 'default', 'TEMPORAL_API_KEY': 'unused-cloud-test-value'}, clear=True):
            address, options = loan_shared.temporal_connect_args()
        self.assertEqual(address, 'temporal:7233')
        self.assertEqual(options, {'namespace': 'default'})

    def test_fieldkit_cloud_env_is_supported(self):
        with patch.dict(os.environ, {'TEMPORAL_ADDRESS': 'example.invalid:7233', 'TEMPORAL_NAMESPACE': 'demo.example', 'TEMPORAL_API_KEY': 'test-only-value'}, clear=True):
            address, options = loan_shared.temporal_connect_args()
        self.assertEqual(address, 'example.invalid:7233')
        self.assertEqual(options, {'namespace': 'demo.example', 'api_key': 'test-only-value', 'tls': True})

    def test_legacy_loan_local_configuration_is_preserved(self):
        with patch.dict(os.environ, {'TEMPORAL_ENV': 'local', 'TEMPORAL_LOCAL_ADDRESS': 'legacy.invalid:7233', 'TEMPORAL_LOCAL_NAMESPACE': 'legacy', 'TEMPORAL_ADDRESS': 'other.invalid:7233'}, clear=True):
            address, options = loan_shared.temporal_connect_args()
        self.assertEqual((address, options), ('legacy.invalid:7233', {'namespace': 'legacy'}))
