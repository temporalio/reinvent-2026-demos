"""Exercise real Loan SDK imports and registration without invoking a provider.

Run inside the compatibility image with networking disabled. Only handler
creation/configuration is tested; invoking a Lambda handler would connect to
Temporal and is deliberately outside this suite.
"""
from __future__ import annotations

import importlib
import inspect
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class LoanSdkCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        environment = patch.dict(os.environ, {
            'AWS_ACCESS_KEY_ID': 'compatibility-test',
            'AWS_SECRET_ACCESS_KEY': 'compatibility-test',
            'AWS_SESSION_TOKEN': '',
            'AWS_EC2_METADATA_DISABLED': 'true',
            'AWS_REGION': 'us-east-1',
            'TEMPORAL_ENV': 'cloud',
            'TEMPORAL_ADDRESS': 'unreachable.invalid:7233',
            'TEMPORAL_NAMESPACE': 'default',
            'TEMPORAL_API_KEY': '',
            'TEMPORAL_CLOUD_ADDRESS': 'unreachable.invalid:7233',
            'TEMPORAL_CLOUD_NAMESPACE': 'default',
            'TEMPORAL_CLOUD_API_KEY': 'compatibility-test',
            'TEMPORAL_TASK_QUEUE': 'ri26-loan-compatibility',
            'TEMPORAL_WORKER_DEPLOYMENT_NAME': 'ri26-loan-compatibility',
            'TEMPORAL_WORKER_BUILD_ID': 'compatibility-test',
        })
        environment.start()
        cls.addClassCleanup(environment.stop)
        cls.native = importlib.import_module('worker')
        # This is the real SDK run_worker factory. It creates a callable but
        # does not connect or poll until that callable is invoked.
        cls.serverless = importlib.import_module('lambda_function')
        cls.workflow_classes = (
            cls.native.LoanUnderwritingWorkflow,
            cls.native.LoanUnderwritingSupervisorWorkflow,
            cls.native.FraudIdentityAgent,
            cls.native.EmploymentVerificationAgent,
        )

    def test_native_worker_and_real_agent_constructors_import(self):
        from temporalio.contrib.strands import TemporalAgent

        self.assertTrue(inspect.iscoroutinefunction(self.native.main))
        for workflow_class in self.workflow_classes:
            with self.subTest(workflow=workflow_class.__name__):
                instance = workflow_class()
                self.assertIsInstance(instance.agent, TemporalAgent)

    def test_lambda_factory_and_callback_use_current_sdk(self):
        from temporalio.contrib.aws.lambda_worker import LambdaWorkerConfig
        from temporalio.contrib.strands import StrandsPlugin

        self.assertTrue(callable(self.serverless.lambda_handler))
        config = LambdaWorkerConfig(
            client_connect_config={'namespace': 'default'},
            worker_config={'max_concurrent_activities': 1},
        )
        self.serverless.configure(config)
        self.assertEqual(config.worker_config['task_queue'], 'ri26-loan-compatibility')
        self.assertEqual(set(config.worker_config['workflows']), set(self.workflow_classes))
        self.assertEqual(
            {activity.__name__ for activity in config.worker_config['activities']},
            {'credit_check', 'calculate_debt_to_income', 'verify_identity_documents',
             'check_application_velocity', 'verify_employer', 'cross_check_income'},
        )
        self.assertTrue(all(callable(activity) for activity in config.worker_config['activities']))
        plugins = config.client_connect_config['plugins']
        self.assertEqual(len(plugins), 1)
        self.assertIsInstance(plugins[0], StrandsPlugin)
        # Configuration must extend the SDK-provided defaults, not replace them.
        self.assertEqual(config.worker_config['max_concurrent_activities'], 1)
        self.assertEqual(config.client_connect_config['namespace'], 'default')


if __name__ == '__main__':
    unittest.main()
