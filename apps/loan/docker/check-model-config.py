"""Verify Bedrock factory wiring offline using the installed SDKs."""
import ast
import os
import sys
from pathlib import Path

# Boto clients may be constructed, but never invoked. Dummy credentials prevent
# metadata lookup, and Docker runs this check with networking disabled.
os.environ.update({
    'AWS_ACCESS_KEY_ID': 'local-model-config-test',
    'AWS_SECRET_ACCESS_KEY': 'local-model-config-test',
    'AWS_EC2_METADATA_DISABLED': 'true',
    'AWS_REGION': 'us-east-1',
    'BEDROCK_MODEL_ID': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
})

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from model_config import AGENT_MODEL_OVERRIDES, build_strands_plugin, model_factories


def check():
    default = os.environ['BEDROCK_MODEL_ID']
    factories = model_factories()
    for alias in AGENT_MODEL_OVERRIDES:
        model = factories[alias]()
        assert model.get_config()['model_id'] == default, alias
        assert model.client.meta.region_name == 'us-east-1', alias
        assert model.client.meta.config.retries['total_max_attempts'] == 1, alias

    override = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
    values = {'BEDROCK_MODEL_ID': default, 'LOAN_FRAUD_MODEL_ID': override, 'AWS_DEFAULT_REGION': 'us-west-2'}
    isolated = model_factories(values)
    # The factory captures startup config, not a mutable environment mapping.
    values['BEDROCK_MODEL_ID'] = 'changed-after-registration'
    assert isolated['loan-fraud']().get_config()['model_id'] == override
    assert isolated['loan-supervisor']().get_config()['model_id'] == default
    assert isolated['loan-supervisor']().client.meta.region_name == 'us-west-2'
    assert model_factories({'BEDROCK_MODEL_ID': default, 'LOAN_FRAUD_MODEL_ID': '  '})['loan-fraud']().get_config()['model_id'] == default

    sources = {
        'workflow.py': {'loan-underwriting'},
        'supervisor.py': {'loan-supervisor'},
        'specialist_agents.py': {'loan-fraud', 'loan-employment'},
    }
    root = Path(__file__).resolve().parents[1]
    for source, expected in sources.items():
        tree = ast.parse((root / source).read_text())
        aliases = {keyword.value.value for call in ast.walk(tree) if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == 'TemporalAgent' for keyword in call.keywords if keyword.arg == 'model' and isinstance(keyword.value, ast.Constant)}
        assert aliases == expected, (source, aliases)
        assert aliases <= factories.keys()
    from workflow import LoanUnderwritingWorkflow
    from supervisor import LoanUnderwritingSupervisorWorkflow
    from specialist_agents import EmploymentVerificationAgent, FraudIdentityAgent
    for cls in (LoanUnderwritingWorkflow, LoanUnderwritingSupervisorWorkflow, FraudIdentityAgent, EmploymentVerificationAgent):
        assert cls().agent is not None
    plugin = build_strands_plugin()
    assert plugin.activities, 'Expected registered Strands model activities'
    print('Loan model configuration passed: all four agents use the declared model; per-agent overrides, AWS region, and Temporal-managed retries are preserved. No inference was invoked.')


if __name__ == '__main__':
    check()
