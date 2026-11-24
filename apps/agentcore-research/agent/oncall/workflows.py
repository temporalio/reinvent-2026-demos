"""The on-call incident Workflow: a Strands agent made durable by Temporal.

The agent investigates with tools, proposes a remediation, and stops until a
person approves it. Everything the agent has done lives in this Workflow's
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
    from temporalio.strands_agents import TemporalAgent
    from temporalio.strands_agents.workflow import activity_as_tool

    from . import activities, services
    from .models import MODEL_NAME

ONCALL_PHASE = SearchAttributeKey.for_keyword("OncallPhase")

# A demo bound on an abandoned incident. A production agent would page the
# next person on the rota here instead of closing it.
APPROVAL_TIMEOUT = timedelta(hours=24)

SYSTEM_PROMPT = """You are an on-call SRE agent. Investigate the alert with your tools before
you conclude anything: read the service's metrics, search its logs, and check recent deploys.
Then call apply_remediation once with the single change most likely to fix the incident
(rollback, restart or scale_out), with a short rationale. A human must approve that call.
After it runs, say in two sentences what you changed and whether the service recovered.
Keep every message under 40 words."""


@dataclass
class IncidentInput:
    incident_id: str
    scenario: str


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
        self._scenario = services.SCENARIOS[incident.scenario]
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
            tools=[
                activity_as_tool(tool, start_to_close_timeout=timedelta(seconds=20), retry_policy=RetryPolicy(maximum_attempts=5))
                for tool in activities.TOOLS
            ],
            hooks=[ApprovalGate(), Progress(self)],
            # Strands prints the stream to stdout by default, on every replay too.
            callback_handler=None,
        )

    @workflow.run
    async def run(self, incident: IncidentInput) -> IncidentReport:
        s = self._scenario
        prompt = f"Incident {incident.incident_id}: {s.alert}. Service: {s.service}. Find the cause and propose a fix."
        result = await self._agent.invoke_async(prompt)
        self._publish(model=self._agent.model.get_config().get("model_id"))

        # The agent stops with an interrupt when it calls apply_remediation (see
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
        """Approve or reject the proposed remediation.

        A Signal, not an Update: the server records it at once, with no Worker
        running, and that is what wakes one. A decision sent when nothing is
        waiting for one is ignored.
        """
        if not self._awaiting or self._decision is not None:
            workflow.logger.warning("decision ignored; no remediation is waiting for approval")
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


class ApprovalGate(HookProvider):
    """Stops the agent before any production change, until a person answers.

    Strands' hook interrupt: the first time the agent calls apply_remediation,
    `interrupt` raises and invoke_async returns stop_reason "interrupt". When
    the Workflow resumes the agent with a response, `interrupt` returns it.
    """

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self._gate)

    def _gate(self, event: BeforeToolCallEvent) -> None:
        if event.tool_use["name"] != activities.apply_remediation.__name__:
            return
        response = event.interrupt("remediation-approval", reason=event.tool_use["input"])
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
