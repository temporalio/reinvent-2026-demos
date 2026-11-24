"""The engineering agent's tools, each a Temporal Activity.

The Workflow offers the agent one tool per Activity below and runs each call as
that Activity, with its own timeout, retries and a recorded result. It passes
the incident in, so the Activity can read the ship's simulated systems (see
services.py). A real agent would call its telemetry, log and maintenance
systems here instead.
"""

from __future__ import annotations

from typing import Any

from temporalio import activity
from temporalio.exceptions import ApplicationError

from . import services
from .services import Scenario


def _check_system(incident: Scenario, system: str) -> None:
    if system != incident.system:
        # The model named a system this alert isn't about. Retrying won't make
        # it one, so the agent gets the error as the tool's result instead.
        raise ApplicationError(
            f"no alert on {system!r}; this incident is about {incident.system}",
            type="UnknownSystem",
            non_retryable=True,
        )


def _incident_key() -> str:
    # The Workflow ID names the incident, so readings stay the same for it.
    return activity.info().workflow_id or ""


@activity.defn
async def read_telemetry(incident: Scenario, system: str) -> dict[str, Any]:
    _check_system(incident, system)
    t = services.telemetry(incident, _incident_key(), healthy=False)
    activity.logger.info("telemetry read system=%s load_pct=%s", system, t["load_pct"])
    return {
        "system": system,
        **t,
        "summary": (
            f"output {t['output_pct']:.0f}%, faults {t['fault_rate_pct']}%, "
            f"core {t['core_temp_c']:.0f}°C, load {t['load_pct']:.0f}% of rated"
        ),
    }


@activity.defn
async def search_ship_logs(incident: Scenario, system: str, query: str) -> dict[str, Any]:
    _check_system(incident, system)
    lines = list(incident.log_lines)
    activity.logger.info("logs searched system=%s query=%s matches=%d", system, query, len(lines))
    return {"system": system, "query": query, "matches": lines, "summary": lines[0]}


@activity.defn
async def list_recent_maintenance(incident: Scenario, system: str) -> dict[str, Any]:
    _check_system(incident, system)
    updates = [{"version": u.version, "minutes_ago": u.minutes_ago, "crew": u.crew} for u in incident.updates]
    newest = updates[0]
    activity.logger.info("maintenance listed system=%s newest=%s", system, newest["version"])
    return {
        "system": system,
        "updates": updates,
        "summary": f"newest firmware {newest['version']}, {newest['minutes_ago']} minutes ago",
    }


@activity.defn
async def apply_repair(incident: Scenario, system: str, action: str, target: str, rationale: str) -> dict[str, Any]:
    _check_system(incident, system)
    if action not in services.ACTIONS:
        raise ApplicationError(
            f"unknown action {action!r}; use one of {', '.join(services.ACTIONS)}",
            type="UnknownAction",
            non_retryable=True,
        )
    # Applying the same repair twice leaves the ship as one application does,
    # so a retry after a lost result is safe.
    fixed = action == incident.fix_action
    after = services.telemetry(incident, _incident_key(), healthy=fixed)
    activity.logger.info("repair applied system=%s action=%s target=%s recovered=%s", system, action, target, fixed)
    outcome = "back to nominal" if fixed else "still degraded"
    return {
        "system": system,
        "action": action,
        "target": target,
        "recovered": fixed,
        "telemetry_after": after,
        "summary": f"{action} {target}: {outcome}, output {after['output_pct']:.0f}%, faults {after['fault_rate_pct']}%",
    }


ACTIVITIES = [read_telemetry, search_ship_logs, list_recent_maintenance, apply_repair]
