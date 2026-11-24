# ABOUTME: The suggested-reply helper. A new Ziggy session publishes its opening trip ideas as
# the `suggestions` state before anyone sends a message, and the helper's Activity works
# without a model configured (local runs) by falling back to built-in trip ideas.
#
# Run with: uv run pytest tests/ziggy/test_suggestions.py -v

from __future__ import annotations

import uuid
from datetime import date

import pytest_asyncio
from google.genai import Client as GeminiClient
from temporalio import activity
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.contrib.workflow_streams import WorkflowStreamClient
from temporalio.testing import ActivityEnvironment
from temporalio.worker import Worker
from tests.temporal_env import start_workflow_environment

from temporal_agent_harness.ai_sdks.google_genai_plugin import GoogleGenAIPlugin
from temporal_agent_harness.harness.agent_protocol import (
    TURN_EVENTS_TOPIC,
    AgentConfig,
    AgentEvent,
    AgentEventType,
)
from temporal_agent_harness.plugin import AgentHarnessPlugin

from agent_harness_demo.ziggy import activities, suggestions
from agent_harness_demo.ziggy.conversational_workflow import ZiggyChatAgentWorkflow
from agent_harness_demo.ziggy.models import TravelerContext
from agent_harness_demo.ziggy.suggestions import Exchange, SuggestRequest

IDEAS = ["Trip one", "Trip two", "Trip three", "Trip four"]
seen: list[SuggestRequest] = []


@activity.defn(name="suggest_replies")
async def fake_suggest_replies(request: SuggestRequest) -> list[str]:
    seen.append(request)
    return IDEAS


@pytest_asyncio.fixture
async def client_and_queue():
    env = await start_workflow_environment(data_converter=pydantic_data_converter)
    task_queue = f"ziggy-suggest-test-{uuid.uuid4()}"
    async with Worker(
        env.client,
        task_queue=task_queue,
        workflows=[ZiggyChatAgentWorkflow],
        activities=[fake_suggest_replies],
        plugins=[
            GoogleGenAIPlugin(GeminiClient(api_key="unused")),
            AgentHarnessPlugin(tools=activities.ALL_TOOLS),
        ],
    ):
        try:
            yield env.client, task_queue
        finally:
            await env.shutdown()


async def test_a_new_session_opens_with_trip_ideas(client_and_queue):
    client, task_queue = client_and_queue
    handle = await client.start_workflow(
        ZiggyChatAgentWorkflow.run,
        args=[AgentConfig(), TravelerContext(today=date(2026, 12, 1))],
        id=f"ZiggyChatAgent-{uuid.uuid4()}",
        task_queue=task_queue,
    )
    replies = None
    stream = WorkflowStreamClient.create(client, handle.id)
    async for item in stream.subscribe(topics=[TURN_EVENTS_TOPIC], from_offset=0, result_type=AgentEvent):
        event = item.data.event
        if event.type == AgentEventType.STATE_PATCH and event.state_id == "suggestions":
            replies = event.ops[0]["value"]["replies"]
            break
    await handle.terminate()

    assert replies == IDEAS
    # The opening request carries the traveler's date and no conversation yet.
    assert seen[-1].today == date(2026, 12, 1)
    assert seen[-1].transcript == []


async def test_without_a_model_the_helper_opens_with_built_in_ideas(monkeypatch):
    monkeypatch.delenv(suggestions.MODEL_ENV, raising=False)
    env = ActivityEnvironment()
    opening = await env.run(suggestions.suggest_replies, SuggestRequest(today=date(2026, 12, 1)))
    assert len(opening) == 4 and set(opening) <= set(suggestions.STARTERS)

    later = SuggestRequest(today=date(2026, 12, 1), transcript=[Exchange(traveler="hi", ziggy="Where to?")])
    assert await env.run(suggestions.suggest_replies, later) == []
