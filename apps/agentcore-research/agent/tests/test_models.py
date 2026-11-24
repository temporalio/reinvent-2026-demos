from __future__ import annotations

import pytest

from oncall.models import ConfigError, StubModel, model_factory_from_env, next_step


def test_model_must_be_chosen():
    with pytest.raises(ConfigError, match="AGENT_MODEL must be bedrock or stub"):
        model_factory_from_env({})


def test_bedrock_needs_a_model_id():
    with pytest.raises(ConfigError, match="BEDROCK_MODEL_ID"):
        model_factory_from_env({"AGENT_MODEL": "bedrock"})


def test_stub_is_labelled():
    model = model_factory_from_env({"AGENT_MODEL": "stub"})()
    assert isinstance(model, StubModel)
    assert "stub" in model.get_config()["model_id"]


def test_stub_investigates_before_proposing():
    messages = [{"role": "user", "content": [{"text": "Incident x: alert. Service: checkout-api."}]}]
    _, tool = next_step(messages)
    assert tool == ("get_service_metrics", {"service": "checkout-api"})
