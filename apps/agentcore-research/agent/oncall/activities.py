"""The agent's tools, each a Temporal Activity.

The Workflow hands these to the Strands agent with `activity_as_tool`, so every
tool call is an Activity with its own timeout, retries and a recorded result.
Strands builds each tool's description from the docstring below.

The services are simulated (see services.py). A real on-call agent would call
its metrics, logging and deploy systems here instead.
"""

from __future__ import annotations

from typing import Any

from temporalio import activity
from temporalio.exceptions import ApplicationError

from . import services


def _scenario(service: str) -> services.Scenario:
    s = services.scenario_for_service(service)
    if s is None:
        known = ", ".join(sorted(services.SERVICES))
        # The model asked for a service that does not exist. Retrying won't
        # create it, so the agent gets the error as the tool's result instead.
        raise ApplicationError(
            f"unknown service {service!r}; known services: {known}",
            type="UnknownService",
            non_retryable=True,
        )
    return s


def _incident_key() -> str:
    # The Workflow ID names the incident, so readings stay the same for it.
    return activity.info().workflow_id or ""


@activity.defn
async def get_service_metrics(service: str) -> dict[str, Any]:
    """Read the current p99 latency, error rate, memory use and request rate of a service.

    Args:
        service: The service name from the alert, for example checkout-api.
    """
    s = _scenario(service)
    m = services.metrics(s, _incident_key(), healthy=False)
    activity.logger.info("metrics read service=%s p99_ms=%s", service, m["p99_latency_ms"])
    return {
        "service": service,
        **m,
        "summary": (
            f"p99 {m['p99_latency_ms']:.0f} ms, errors {m['error_rate_pct']}%, "
            f"memory {m['memory_pct']:.0f}%, {m['requests_per_second']:.0f} req/s"
        ),
    }


@activity.defn
async def search_logs(service: str, query: str) -> dict[str, Any]:
    """Search the last 30 minutes of a service's logs.

    Args:
        service: The service name.
        query: A word to look for, such as error, memory or timeout.
    """
    s = _scenario(service)
    lines = list(s.log_lines)
    activity.logger.info("logs searched service=%s query=%s matches=%d", service, query, len(lines))
    return {"service": service, "query": query, "matches": lines, "summary": lines[0]}


@activity.defn
async def list_recent_deploys(service: str) -> dict[str, Any]:
    """List a service's deploys, newest first.

    Args:
        service: The service name.
    """
    s = _scenario(service)
    deploys = [{"version": v, "minutes_ago": m, "author": a} for v, m, a in s.deploys]
    newest = deploys[0]
    activity.logger.info("deploys listed service=%s newest=%s", service, newest["version"])
    return {
        "service": service,
        "deploys": deploys,
        "summary": f"newest {newest['version']}, {newest['minutes_ago']} minutes ago",
    }


@activity.defn
async def apply_remediation(service: str, action: str, target: str, rationale: str) -> dict[str, Any]:
    """Change production to fix the incident. An on-call engineer must approve every call.

    Args:
        service: The service to change.
        action: One of rollback, restart or scale_out.
        target: For rollback the version to return to; for restart the service; for scale_out the replica count.
        rationale: One or two sentences on why this fixes the incident, shown to the approver.
    """
    s = _scenario(service)
    if action not in services.ACTIONS:
        raise ApplicationError(
            f"unknown action {action!r}; use one of {', '.join(services.ACTIONS)}",
            type="UnknownAction",
            non_retryable=True,
        )
    # Applying the same change twice leaves the service as one application
    # does, so a retry after a lost result is safe.
    fixed = action == s.fix_action
    after = services.metrics(s, _incident_key(), healthy=fixed)
    activity.logger.info("remediation applied service=%s action=%s target=%s recovered=%s", service, action, target, fixed)
    outcome = "recovered" if fixed else "still degraded"
    return {
        "service": service,
        "action": action,
        "target": target,
        "recovered": fixed,
        "metrics_after": after,
        "summary": f"{action} {target}: {outcome}, p99 {after['p99_latency_ms']:.0f} ms, errors {after['error_rate_pct']}%",
    }


TOOLS = [get_service_metrics, search_logs, list_recent_deploys, apply_remediation]
