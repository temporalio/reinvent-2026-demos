"""IncidentWorkflow against Temporal's time-skipping test server, with the stub model.

These check the three things the demo claims: the Workflow waits for approval
for as long as it takes with nothing running, a different Worker picks up the
approval and finishes the incident, and no model call or tool call runs twice.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import timedelta

import pytest
from temporalio.api.enums.v1 import EventType, IndexedValueType
from temporalio.api.operatorservice.v1 import AddSearchAttributesRequest
from temporalio.client import Client, WorkflowHandle
from temporalio.common import SearchAttributeKey
from temporalio.strands_agents import StrandsPlugin
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from oncall import activities
from oncall.models import MODEL_NAME, StubModel
from oncall.services import Scenario, Update
from oncall.workflows import Decision, IncidentInput, IncidentReport, IncidentWorkflow

TASK_QUEUE = "oncall-test"

# One incident per cause, shaped like the ones the API generates.
SCENARIOS = {
    "bad_update": Scenario(
        key="t-update", title="Port ion drive stutters after a firmware push", system="port-ion-drive",
        alert="port-ion-drive thrust faults above 6% for 5 minutes", cause="bad_update",
        log_lines=["ERROR thrust vector checksum mismatch", "WARN injector timing table v4.2.0 rejected", "INFO firmware v4.2.0 applied by Pip"],
        updates=[Update("v4.2.0", 12, "Pip"), Update("v4.1.3", 4100, "maintenance-bot")], fix_target="v4.1.3",
    ),
    "wear": Scenario(
        key="t-wear", title="Hydroponics pump running hot", system="hydroponics-pump",
        alert="hydroponics-pump core above 140°C", cause="wear",
        log_lines=["WARN bearing temperature 158°C", "WARN flow 61% of setpoint", "INFO last service 214 days ago"],
        updates=[Update("v2.0.9", 8800, "Juno")], fix_target="hydroponics-pump",
    ),
    "overload": Scenario(
        key="t-load", title="Shield emitters overloaded in a meteor shower", system="forward-shield-array",
        alert="forward-shield-array load at 290% of rated", cause="overload",
        log_lines=["WARN emitter load 290% of rated", "WARN capacitor bank at limit", "INFO meteor density 3.4x normal"],
        updates=[Update("v7.3.1", 6200, "Orion")], fix_target="auxiliary power bus",
    ),
}


@pytest.fixture(scope="session")
async def env():
    env = await WorkflowEnvironment.start_time_skipping()
    # The platform creates OncallPhase on the demo's namespace (spec.temporal.searchAttributes).
    await env.client.operator_service.add_search_attributes(
        AddSearchAttributesRequest(
            namespace=env.client.namespace,
            search_attributes={"OncallPhase": IndexedValueType.INDEXED_VALUE_TYPE_KEYWORD},
        )
    )
    yield env
    await env.shutdown()


def worker(client: Client, identity: str) -> Worker:
    return Worker(
        client,
        task_queue=TASK_QUEUE,
        identity=identity,
        # No cache: every Workflow Task replays the whole history, as a new
        # Worker on a new AgentCore session does. It also keeps the test
        # server from holding the next task for a Worker that has gone.
        max_cached_workflows=0,
        workflows=[IncidentWorkflow],
        activities=activities.ACTIVITIES,
        plugins=[StrandsPlugin(models={MODEL_NAME: lambda: StubModel(delay_seconds=0)})],
    )


async def start(client: Client, cause: str = "bad_update") -> WorkflowHandle:
    incident_id = uuid.uuid4().hex[:8]
    return await client.start_workflow(
        IncidentWorkflow.run,
        IncidentInput(incident_id=incident_id, scenario=SCENARIOS[cause]),
        id=f"oncall-test-{incident_id}",
        task_queue=TASK_QUEUE,
        result_type=IncidentReport,
    )


async def memo_phase(handle: WorkflowHandle) -> str | None:
    # The same read the API makes: Describe, not a Query.
    memo = await (await handle.describe()).memo()
    return memo.get("phase")


async def wait_for_phase(env: WorkflowEnvironment, handle: WorkflowHandle, phase: str) -> None:
    for _ in range(200):
        if await memo_phase(handle) == phase:
            return
        await env.sleep(timedelta(milliseconds=100))
    pytest.fail(f"workflow never reached phase {phase}; memo phase is {await memo_phase(handle)}")


async def scheduled_activities(handle: WorkflowHandle) -> Counter[str]:
    counts: Counter[str] = Counter()
    async for event in handle.fetch_history_events():
        if event.event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
            counts[event.activity_task_scheduled_event_attributes.activity_type.name] += 1
    return counts


async def workflow_task_workers(handle: WorkflowHandle) -> list[str]:
    identities = []
    async for event in handle.fetch_history_events():
        if event.event_type == EventType.EVENT_TYPE_WORKFLOW_TASK_COMPLETED:
            who = event.workflow_task_completed_event_attributes.identity
            if not identities or identities[-1] != who:
                identities.append(who)
    return identities


async def test_waits_for_approval_then_remediates(env: WorkflowEnvironment):
    async with worker(env.client, "worker-a"):
        handle = await start(env.client)
        await wait_for_phase(env, handle, "awaiting_approval")
        memo = await (await handle.describe()).memo()
        assert memo["proposal"]["action"] == "rollback"
        assert memo["proposal"]["target"] == "v4.1.3"
        assert memo["model"] == "stub (scripted, offline)"

        # A day less an hour later, it is still waiting, with no remediation run.
        await env.sleep(timedelta(hours=23))
        assert await memo_phase(handle) == "awaiting_approval"
        assert "apply_repair" not in await scheduled_activities(handle)

        await handle.signal(IncidentWorkflow.decide, Decision(approved=True, approver="test"))
        report = await handle.result()

    assert report.phase == "resolved"
    assert "back to nominal" in report.summary
    desc = await handle.describe()
    assert desc.typed_search_attributes.get(SearchAttributeKey.for_keyword("OncallPhase")) == "resolved"


async def test_new_worker_resumes_without_repeating_any_call(env: WorkflowEnvironment):
    # The first Worker diagnoses, then goes away while the incident waits,
    # as an AgentCore session does when it idles out.
    async with worker(env.client, "worker-a"):
        handle = await start(env.client)
        await wait_for_phase(env, handle, "awaiting_approval")
    before = await scheduled_activities(handle)

    await handle.signal(IncidentWorkflow.decide, Decision(approved=True, approver="test"))
    # A fresh Worker, with a fresh plugin and model: no state carries over
    # except what Temporal has in the history.
    async with worker(env.client, "worker-b"):
        report = await handle.result()

    assert report.phase == "resolved"
    after = await scheduled_activities(handle)
    # Four model turns before approval (telemetry, logs, maintenance, proposal) and
    # one after (the summary). Each tool runs exactly once.
    assert before["invoke_model"] == 4
    assert after["invoke_model"] == 5
    for tool in ("read_telemetry", "search_ship_logs", "list_recent_maintenance", "apply_repair"):
        assert after[tool] == 1, f"{tool} scheduled {after[tool]} times"
    assert after["strands_get_model_config"] == 1
    assert await workflow_task_workers(handle) == ["worker-a", "worker-b"]


async def test_rejection_closes_without_changing_production(env: WorkflowEnvironment):
    async with worker(env.client, "worker-a"):
        handle = await start(env.client, "wear")
        await wait_for_phase(env, handle, "awaiting_approval")
        await handle.signal(IncidentWorkflow.decide, Decision(approved=False, approver="test", note="not during peak"))
        report = await handle.result()

    assert report.phase == "closed"
    assert "apply_repair" not in await scheduled_activities(handle)
    memo = await (await handle.describe()).memo()
    assert memo["decision"]["approved"] is False
    repair = [s for s in memo["steps"] if s.get("tool") == "apply_repair"]
    assert [s["status"] for s in repair] == ["error"]
    assert "not during peak" in repair[0]["text"]


async def test_no_decision_in_24_hours_closes_the_incident(env: WorkflowEnvironment):
    async with worker(env.client, "worker-a"):
        handle = await start(env.client, "overload")
        await wait_for_phase(env, handle, "awaiting_approval")
        await env.sleep(timedelta(hours=25))
        report = await handle.result()

    assert report.phase == "closed"
    memo = await (await handle.describe()).memo()
    assert memo["decision"]["approver"] == "nobody"


@pytest.mark.parametrize("cause,action", [("wear", "power_cycle"), ("overload", "reroute_power")])
async def test_the_evidence_points_to_the_right_repair(env: WorkflowEnvironment, cause: str, action: str):
    async with worker(env.client, "worker-a"):
        handle = await start(env.client, cause)
        await wait_for_phase(env, handle, "awaiting_approval")
        memo = await (await handle.describe()).memo()
        assert memo["proposal"]["action"] == action
        await handle.signal(IncidentWorkflow.decide, Decision(approved=True, approver="test"))
        report = await handle.result()
    assert report.phase == "resolved"
    assert "back to nominal" in report.summary
