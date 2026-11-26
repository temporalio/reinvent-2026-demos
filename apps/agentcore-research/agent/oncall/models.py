"""Model factories for the Strands plugin, chosen by AGENT_MODEL.

The Workflow always asks for the model named "oncall"; the Worker decides what
that is. `StrandsPlugin(models=...)` calls the factory on the Worker, outside
the Workflow, so the Workflow code is the same whichever model runs.

- bedrock: Amazon Bedrock through Strands' BedrockModel, model id from
  BEDROCK_MODEL_ID, credentials from boto3's default chain (on AgentCore, the
  runtime's execution role).
- stub: a scripted model for running offline. It is labelled as a stub
  everywhere it appears, and the Worker never falls back to it.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncGenerator, AsyncIterable, Callable
from typing import Any

from botocore.config import Config as BotocoreConfig
from strands.models import BedrockModel, Model
from strands.models.bedrock import DEFAULT_READ_TIMEOUT
from strands.types.content import Messages
from strands.types.streaming import StreamEvent

MODEL_NAME = "oncall"
STUB_MODEL_ID = "stub (scripted, offline)"


class ConfigError(Exception):
    """Required configuration is missing or invalid; the Worker must not start."""


def model_factory_from_env(env: dict[str, str] | os._Environ[str] = os.environ) -> Callable[[], Model]:
    """Return the factory AGENT_MODEL names, or raise ConfigError."""
    choice = env.get("AGENT_MODEL", "")
    if choice == "bedrock":
        model_id = env.get("BEDROCK_MODEL_ID", "")
        if not model_id:
            raise ConfigError("AGENT_MODEL=bedrock needs BEDROCK_MODEL_ID (a Bedrock model or inference profile ID)")

        def bedrock() -> Model:
            # Temporal retries the model Activity, so Botocore must not retry
            # inside an attempt as well (the plugin's own default does this).
            return BedrockModel(
                model_id=model_id,
                boto_client_config=BotocoreConfig(read_timeout=DEFAULT_READ_TIMEOUT, retries={"max_attempts": 0}),
            )

        return bedrock
    if choice == "stub":
        delay = float(env.get("AGENT_STUB_DELAY_SECONDS", "1.5"))
        return lambda: StubModel(delay_seconds=delay)
    raise ConfigError(f"AGENT_MODEL must be bedrock or stub, got {choice!r}")


class StubModel(Model):
    """A scripted stand-in for Bedrock: same tools, same order, no network.

    It reads the conversation so far and plays the next step of a fixed
    investigation: telemetry, logs, maintenance, then a repair proposal drawn
    from that evidence, then a summary of what the repair did. The pause before each answer stands
    in for a real model's latency so each step is visible on screen.
    """

    def __init__(self, delay_seconds: float = 1.5) -> None:
        self._config: dict[str, Any] = {"model_id": STUB_MODEL_ID}
        self._delay = delay_seconds

    def update_config(self, **model_config: Any) -> None:
        self._config.update(model_config)

    def get_config(self) -> dict[str, Any]:
        return self._config

    def structured_output(self, output_model: Any, prompt: Messages, system_prompt: str | None = None, **kwargs: Any) -> AsyncGenerator[dict[str, Any], None]:
        raise NotImplementedError("the stub model has no structured output")

    async def stream(self, messages: Messages, tool_specs: Any = None, system_prompt: str | None = None, **kwargs: Any) -> AsyncIterable[StreamEvent]:
        await asyncio.sleep(self._delay)
        text, tool = next_step(messages)
        # The tool use ID must be the same on every attempt: Strands derives the
        # approval interrupt's ID from it.
        tool_use_id = f"stub-{len(messages)}"
        yield {"messageStart": {"role": "assistant"}}
        yield {"contentBlockDelta": {"delta": {"text": text}}}
        yield {"contentBlockStop": {}}
        if tool is not None:
            name, args = tool
            yield {"contentBlockStart": {"start": {"toolUse": {"toolUseId": tool_use_id, "name": name}}}}
            yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}
            yield {"contentBlockStop": {}}
        yield {"messageStop": {"stopReason": "tool_use" if tool else "end_turn"}}
        yield {"metadata": {"usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}, "metrics": {"latencyMs": int(self._delay * 1000)}}}


def _tool_results(messages: Messages) -> dict[str, dict[str, Any]]:
    """The latest result of each tool, by tool name, with its status."""
    names = {}
    results: dict[str, dict[str, Any]] = {}
    for message in messages:
        for block in message.get("content", []):
            if "toolUse" in block:
                names[block["toolUse"]["toolUseId"]] = block["toolUse"]["name"]
            if "toolResult" in block:
                result = block["toolResult"]
                text = "".join(c.get("text", "") for c in result.get("content", []))
                results[names.get(result["toolUseId"], "")] = {"status": result.get("status"), "text": text}
    return results


def _system_from_prompt(messages: Messages) -> str:
    first = "".join(c.get("text", "") for c in messages[0].get("content", []))
    match = re.search(r"System: ([a-z0-9-]+)", first)
    return match.group(1) if match else ""


def _repair(telemetry: dict[str, Any], maintenance: dict[str, Any], system: str) -> tuple[str, str, str]:
    """What a careful engineer concludes from the evidence: action, target, rationale."""
    updates = maintenance.get("updates", [])
    newest = updates[0] if updates else None
    if newest and newest["minutes_ago"] < 60 and len(updates) > 1:
        previous = updates[1]["version"]
        return "rollback", previous, f"Faults began after firmware {newest['version']} went in {newest['minutes_ago']} minutes ago; rolling back to {previous} should clear them."
    if telemetry.get("load_pct", 0) > 150:
        return "reroute_power", "auxiliary power bus", f"{system} is carrying {telemetry['load_pct']:.0f}% of its rated load; moving the excess to the auxiliary bus brings it back within limits."
    return "power_cycle", system, f"The core is running hot on long-standing firmware, so a clean power cycle should reset it."


def next_step(messages: Messages) -> tuple[str, tuple[str, dict[str, Any]] | None]:
    """The stub's answer to the conversation so far: text, and a tool call or None."""
    system = _system_from_prompt(messages)
    if not system:
        return "I can't tell which ship system the alert is about, so I can't investigate it.", None
    done = _tool_results(messages)
    if "read_telemetry" not in done:
        return f"Pulling live telemetry from {system}.", ("read_telemetry", {"system": system})
    if "search_ship_logs" not in done:
        return "Readings are off nominal. Searching the system logs for the cause.", ("search_ship_logs", {"system": system, "query": "fault"})
    if "list_recent_maintenance" not in done:
        return "Checking whether recent maintenance lines up with the logs.", ("list_recent_maintenance", {"system": system})
    if "apply_repair" not in done:
        action, target, rationale = _repair(json.loads(done["read_telemetry"]["text"]), json.loads(done["list_recent_maintenance"]["text"]), system)
        args = {"system": system, "action": action, "target": target, "rationale": rationale}
        return f"Recommended repair: {action} {target}. It changes the ship, so it needs the captain's approval.", ("apply_repair", args)
    applied = done["apply_repair"]
    if applied["status"] != "success":
        return f"The repair was not applied ({applied['text']}). {system} is still degraded; logging it for the next watch.", None
    return f"Repair applied and verified: {json.loads(applied['text'])['summary']}. Closing the alert.", None
