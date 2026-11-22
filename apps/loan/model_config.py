"""Worker-side Bedrock factories for the Loan agents.

TemporalAgent accepts a registered alias. Bedrock model IDs belong in the
worker's factory, so workflow execution does not read process configuration.
"""
from __future__ import annotations

import os
from collections.abc import Callable, Mapping
from functools import partial

from botocore.config import Config as BotocoreConfig
from strands.models import BedrockModel
from strands.models.bedrock import DEFAULT_READ_TIMEOUT
from temporalio.contrib.strands import StrandsPlugin

# Values are optional explicit overrides; otherwise all agents use the model
# declared as BEDROCK_MODEL_ID by the single Fieldkit definition.
AGENT_MODEL_OVERRIDES = {
    'loan-underwriting': 'LOAN_UNDERWRITING_MODEL_ID',
    'loan-supervisor': 'LOAN_SUPERVISOR_MODEL_ID',
    'loan-fraud': 'LOAN_FRAUD_MODEL_ID',
    'loan-employment': 'LOAN_EMPLOYMENT_MODEL_ID',
}


def _bedrock_model(model_id: str | None, region: str | None) -> BedrockModel:
    config = {}
    if model_id:
        config['model_id'] = model_id
    # Match the installed Temporal integration: Temporal owns retries.
    return BedrockModel(
        **config,
        region_name=region,
        boto_client_config=BotocoreConfig(
            read_timeout=DEFAULT_READ_TIMEOUT,
            retries={'max_attempts': 0},
        ),
    )


def model_factories(env: Mapping[str, str] | None = None) -> dict[str, Callable[[], BedrockModel]]:
    """Capture model configuration at worker setup; defer AWS clients to Activities."""
    values = os.environ if env is None else env
    default = values.get('BEDROCK_MODEL_ID', '').strip() or None
    region = values.get('AWS_REGION') or values.get('AWS_DEFAULT_REGION') or None
    factories = {
        alias: partial(_bedrock_model, values.get(override, '').strip() or default, region)
        for alias, override in AGENT_MODEL_OVERRIDES.items()
    }
    factories['bedrock'] = partial(_bedrock_model, default, region)
    return factories


def build_strands_plugin() -> StrandsPlugin:
    """Register the factories for both native and Lambda workers."""
    return StrandsPlugin(models=model_factories())
