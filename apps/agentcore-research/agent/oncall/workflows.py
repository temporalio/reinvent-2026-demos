"""The starship incident Workflow: a Strands agent made durable by Temporal.

Ziggy's engineering agent investigates a ship alert with tools, proposes a
repair, and stops until the captain approves it. Everything the agent has done lives in this Workflow's
Event History, so the wait can last hours with no Worker running, and the
Worker that picks up the approval can be a different process on different
compute. It replays the history (no model call repeats) and carries on.

The UI never sends a Query: Queries need a running Worker, and on AgentCore
there usually isn't one. It reads the memo and the OncallPhase Search
Attribute that this Workflow keeps current, with DescribeWorkflowExecution.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy, SearchAttributeKey

with workflow.unsafe.imports_passed_through():
    from strands.hooks import HookProvider, HookRegistry
    from strands.hooks.events import AfterModelCallEvent, AfterToolCallEvent, BeforeToolCallEvent
    from strands import tool
    from temporalio.strands_agents import TemporalAgent

    from . import activities
    from .models import MODEL_NAME
    from .services import Scenario

ONCALL_PHASE = SearchAttributeKey.for_keyword("OncallPhase")

# A demo bound on an abandoned incident. A real ship would page the
# next officer on watch here instead of closing it.
APPROVAL_TIMEOUT = timedelta(hours=24)

SYSTEM_PROMPT = """You are the engineering agent aboard Ziggy's starship, a calm, capable ship's
engineer. A ship system has raised an alert. Investigate with your tools before you conclude
anything: read the system's telemetry, search its logs, and check its recent maintenance.
Then call apply_repair once with the single repair most likely to fix it (rollback,
power_cycle or reroute_power), with a short rationale. The captain must approve that call.
After it runs, say in two sentences what you changed and whether the system recovered.
Keep every message under 40 words."""

# Each tool call is an Activity. Telemetry and logs answer in milliseconds; 20
# seconds leaves room for a slow Worker start without hiding a stuck call.
TOOL_TIMEOUT = timedelta(seconds=20)
TOOL_RETRIES = RetryPolicy(maximum_attempts=5)


@dataclass
class IncidentInput:
    incident_id: str
    # The whole incident, as the API generated it: there is no fixed list to look it up in.
    scenario: Scenario


@dataclass
class Decision:
    approved: bool
    approver: str
    note: str = ""


@dataclass
class IncidentReport:
    phase: str
    summary: str


@workflow.defn
class IncidentWorkflow:
    @workflow.init
    def __init__(self, incident: IncidentInput) -> None:
        self._scenario = incident.scenario
        self._decision: Decision | None = None
        self._awaiting = False
        self._memo: dict[str, Any] = {"phase": "diagnosing", "steps": [], "proposal": None, "decision": None, "summary": None}
        # The model's tool calls and model calls are Activities: the plugin
        # records each one in the history, so a replay reuses its result.
        self._agent = TemporalAgent(
            model=MODEL_NAME,
            # Bedrock answers in seconds; a minute covers a slow turn. The
            # plugin heartbeats every model call, so a lost Worker is noticed
            # in 10 seconds, not at this timeout.
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=RetryPolicy(maximum_attempts=5),
            system_prompt=SYSTEM_PROMPT,
            tools=ship_tools(incident.scenario),
            hooks=[ApprovalGate(), Progress(self)],
            # Strands prints the stream to stdout by default, on every replay too.
            callback_handler=None,
        )

    @workflow.run
    async def run(self, incident: IncidentInput) -> IncidentReport:
        s = self._scenario
        prompt = f"Ship alert {incident.incident_id}: {s.alert}. System: {s.system}. Find the cause and propose a repair."
        result = await self._agent.invoke_async(prompt)
        self._publish(model=self._agent.model.get_config().get("model_id"))

        # The agent stops with an interrupt when it calls apply_repair (see
        # ApprovalGate). Waiting here is a durable wait: the Worker can drain and
        # go away, and the approval Signal brings a new one back to this line.
        while result.stop_reason == "interrupt":
            interrupt = result.interrupts[0]
            self._decision = None
            self._awaiting = True
            # A None memo value removes the key, which clears an earlier decision.
            self._set_phase("awaiting_approval", proposal=interrupt.reason, decision=None)
            try:
                await workflow.wait_condition(lambda: self._decision is not None, timeout=APPROVAL_TIMEOUT)
                decision = self._decision or Decision(approved=False, approver="nobody")
            except asyncio.TimeoutError:
                decision = Decision(approved=False, approver="nobody", note="no decision within 24 hours")
                self._decision = decision
            self._awaiting = False
            self._set_phase("remediating" if decision.approved else "closing", decision={**asdict(decision), "at": workflow.now().isoformat()})
            response = "approve" if decision.approved else f"rejected by {decision.approver}: {decision.note or 'no reason given'}"
            result = await self._agent.invoke_async([{"interruptResponse": {"interruptId": interrupt.id, "response": response}}])

        summary = str(result).strip()
        final = "resolved" if self._decision and self._decision.approved else "closed"
        self._set_phase(final, summary=summary)
        return IncidentReport(phase=final, summary=summary)

    @workflow.signal
    def decide(self, decision: Decision) -> None:
        """Approve or reject the proposed repair.

        A Signal, not an Update: the server records it at once, with no Worker
        running, and that is what wakes one. A decision sent when nothing is
        waiting for one is ignored.
        """
        if not self._awaiting or self._decision is not None:
            workflow.logger.warning("decision ignored; no repair is waiting for approval")
            return
        self._decision = decision

    def _set_phase(self, phase: str, **fields: Any) -> None:
        # One Search Attribute upsert per phase change (each is a billable
        # Action); the memo carries the detail and changes for free.
        workflow.upsert_search_attributes([ONCALL_PHASE.value_set(phase)])
        self._publish(phase=phase, **fields)

    def _publish(self, **fields: Any) -> None:
        self._memo.update(fields)
        workflow.upsert_memo(fields)

    def _add_step(self, step: dict[str, Any]) -> None:
        steps = self._memo["steps"] + [{**step, "at": workflow.now().isoformat()}]
        self._publish(steps=steps)


def ship_tools(incident: Scenario) -> list[Any]:
    """The agent's tools. The model picks the system, the query and the repair;
    the Workflow adds the incident it was started with, so each Activity reads
    this incident's ship and nothing the model could make up."""

    async def run(activity_fn: Any, *args: Any) -> str:
        result = await workflow.execute_activity(
            activity_fn, args=[incident, *args], start_to_close_timeout=TOOL_TIMEOUT, retry_policy=TOOL_RETRIES
        )
        return json.dumps(result)

    @tool
    async def read_telemetry(system: str) -> str:
        """Read a ship system's live telemetry: output, fault rate, core temperature and load against its rating.

        Args:
            system: The system named in the alert, for example port-ion-drive.
        """
        return await run(activities.read_telemetry, system)

    @tool
    async def search_ship_logs(system: str, query: str) -> str:
        """Search the last 30 minutes of a ship system's logs.

        Args:
            system: The system name.
            query: A word to look for, such as fault, firmware or overheat.
        """
        return await run(activities.search_ship_logs, system, query)

    @tool
    async def list_recent_maintenance(system: str) -> str:
        """List a ship system's firmware updates and maintenance, newest first.

        Args:
            system: The system name.
        """
        return await run(activities.list_recent_maintenance, system)

    @tool
    async def apply_repair(system: str, action: str, target: str, rationale: str) -> str:
        """Repair a ship system. The captain must approve every call.

        Args:
            system: The system to repair.
            action: One of rollback (return to an earlier firmware version), power_cycle (restart the system) or reroute_power (move load to spare capacity).
            target: For rollback the firmware version to return to; for power_cycle the system; for reroute_power where the load goes.
            rationale: One or two sentences on why this fixes the alert, shown to the captain.
        """
        return await run(activities.apply_repair, system, action, target, rationale)

    return [read_telemetry, search_ship_logs, list_recent_maintenance, apply_repair]


class ApprovalGate(HookProvider):
    """Stops the agent before any repair, until the captain answers.

    Strands' hook interrupt: the first time the agent calls apply_repair,
    `interrupt` raises and invoke_async returns stop_reason "interrupt". When
    the Workflow resumes the agent with a response, `interrupt` returns it.
    """

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self._gate)

    def _gate(self, event: BeforeToolCallEvent) -> None:
        if event.tool_use["name"] != activities.apply_repair.__name__:
            return
        response = event.interrupt("repair-approval", reason=event.tool_use["input"])
        if response != "approve":
            event.cancel_tool = f"Not applied: the change was {response}."


class Progress(HookProvider):
    """Copies each model turn and tool call into the memo for the UI."""

    def __init__(self, wf: IncidentWorkflow) -> None:
        self._wf = wf

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(AfterModelCallEvent, self._model_turn)
        registry.add_callback(AfterToolCallEvent, self._tool_call)

    def _model_turn(self, event: AfterModelCallEvent) -> None:
        if event.stop_response is None:
            return
        text = " ".join(c["text"] for c in event.stop_response.message["content"] if "text" in c).strip()
        if text:
            self._wf._add_step({"kind": "thought", "text": text})

    def _tool_call(self, event: AfterToolCallEvent) -> None:
        result = event.result
        text = "".join(c.get("text", "") for c in result.get("content", []))
        if result.get("status") == "success":
            try:
                text = json.loads(text).get("summary", text)
            except (ValueError, AttributeError):
                pass
        self._wf._add_step({"kind": "tool", "tool": event.tool_use["name"], "input": event.tool_use["input"], "status": result.get("status"), "text": text})
