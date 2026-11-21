"""Run one real local Temporal Workflow through the production agent factory.

Uses only Pydantic AI's TestModel. No provider key, GitHub token, model API call,
Redis stream, or external repository is involved. Requires a running local
Temporal server; set TEMPORAL_TEST_ADDRESS for the test container's endpoint.

From the app directory after the locked environment is installed:
    TEMPORAL_TEST_ADDRESS=temporal:7233 .venv/bin/python tests/check_temporal_durability_execution.py

Run in CI without provider/GitHub secrets; the script refuses nonempty keys.
"""
from __future__ import annotations

import asyncio
import importlib
import json
import os
from pathlib import Path
import sys
from datetime import timedelta
from unittest.mock import patch
import uuid

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from pydantic_ai.durable_exec.temporal import AgentPlugin, PydanticAIPlugin, TemporalDurability
    from pydantic_ai.models.test import TestModel
    from temporalio.client import Client
    from temporalio.worker import Worker
    from agentic_sdlc.agents import harness_ext
    from agentic_sdlc.sandbox import workflow_runner


EXPECTED_RESULT = 'synthetic durable model execution passed'
MODEL_KEY = 'test:temporal-migration-proof'
AGENT_NAME = 'temporal-migration-proof'


@workflow.defn
class TemporalDurabilityExecutionProof:
    @workflow.run
    async def run(self) -> str:
        with workflow.unsafe.imports_passed_through():
            from agentic_sdlc.agents import runtime
        result = await runtime.TEMPORAL_MIGRATION_PROOF_AGENT.run(
            'Return the synthetic compatibility result.',
            deps=harness_ext.DemoDeps(),
            model=MODEL_KEY,
        )
        return result.output


async def run_proof() -> dict:
    for name in ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GITHUB_TOKEN']:
        if os.environ.get(name):
            raise RuntimeError('Run this synthetic proof without provider keys or a GitHub token.')
    # The actual runtime module constructs all role agents at import time. Patch
    # the registry factory before importing it so no provider client is created.
    if 'agentic_sdlc.agents.runtime' in sys.modules:
        raise RuntimeError('Run the proof in a fresh Python process before importing the agent runtime.')
    models = {MODEL_KEY: TestModel(call_tools=[], custom_output_text=EXPECTED_RESULT)}
    with patch('agentic_sdlc.agents.registry.build_registry', return_value=models):
        runtime = importlib.import_module('agentic_sdlc.agents.runtime')
    agent = runtime._agent(AGENT_NAME, instructions='Return the model result.', output_type=str, tools=[])
    runtime.TEMPORAL_MIGRATION_PROOF_AGENT = agent
    durability = TemporalDurability.from_agent(agent)
    assert durability is not None
    assert durability._event_stream_handler is harness_ext.event_stream_handler
    # This is the real event handler, with no harness turn context. It drains the
    # synthetic stream and intentionally has no Redis/event-consumer destination.
    suffix = uuid.uuid4().hex[:12]
    task_queue = f'ri26-sdlc-durability-proof-{suffix}'
    workflow_id = f'ri26-sdlc-durability-proof-{suffix}'
    address = os.environ.get('TEMPORAL_TEST_ADDRESS', '127.0.0.1:7233')
    client = await Client.connect(address, namespace='default', plugins=[PydanticAIPlugin()])
    async with Worker(
        client,
        task_queue=task_queue,
        workflows=[TemporalDurabilityExecutionProof],
        plugins=[AgentPlugin(agent)],
        workflow_runner=workflow_runner(),
    ):
        handle = await client.start_workflow(
            TemporalDurabilityExecutionProof.run,
            id=workflow_id,
            task_queue=task_queue,
            execution_timeout=timedelta(seconds=60),
        )
        result = await asyncio.wait_for(handle.result(), timeout=65)
        assert result == EXPECTED_RESULT, result
        history = await handle.fetch_history()
    scheduled = [event.activity_task_scheduled_event_attributes.activity_type.name
                 for event in history.events if event.HasField('activity_task_scheduled_event_attributes')]
    model_activities = [name for name in scheduled if name in {
        f'agent__{AGENT_NAME}__model_request', f'agent__{AGENT_NAME}__model_request_stream',
    }]
    assert model_activities, f'No durable model Activity in history: {scheduled}'
    report = {'workflow_id': workflow_id, 'task_queue': task_queue, 'result': result,
              'model_activities': model_activities, 'scheduled_activities': scheduled,
              'event_sink': 'production handler with no harness turn context; no Redis streaming'}
    print(json.dumps(report, indent=2))
    return report


if __name__ == '__main__':
    # Import by module name so the production sandbox can re-import the Workflow
    # definition without executing this command-line entry point.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    module = importlib.import_module(Path(__file__).stem)
    asyncio.run(module.run_proof())
