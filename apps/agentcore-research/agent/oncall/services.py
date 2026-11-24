"""Simulated production services the agent investigates and fixes.

This is demo machinery, not part of the Temporal pattern. The services are
data in this file, so the tools need no network: AgentCore runs the Worker
outside any cluster, and a tool that called an internal service would not reach
it. Every reading is derived from the incident's Workflow ID, so the same
incident always shows the same numbers, on any Worker and on any retry.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    key: str
    title: str
    service: str
    alert: str
    # What the logs and deploys show, and the one action that fixes it.
    log_query: str
    log_lines: tuple[str, ...]
    deploys: tuple[tuple[str, int, str], ...]  # (version, minutes ago, author)
    fix_action: str
    fix_target: str


SCENARIOS: dict[str, Scenario] = {
    s.key: s
    for s in (
        Scenario(
            key="bad-deploy",
            title="Checkout errors after a deploy",
            service="checkout-api",
            alert="checkout-api 5xx rate above 5% for 5 minutes",
            log_query="error",
            log_lines=(
                "ERROR db pool exhausted: 50/50 connections in use, waited 3000ms",
                "ERROR POST /checkout 503 upstream timeout (orders-db)",
                "WARN  config: DB_POOL_SIZE=50 (was 200 in v2.13.2)",
            ),
            deploys=(("v2.14.0", 14, "release-bot"), ("v2.13.2", 2890, "release-bot")),
            fix_action="rollback",
            fix_target="v2.13.2",
        ),
        Scenario(
            key="memory-leak",
            title="Search indexer restarting under memory pressure",
            service="search-indexer",
            alert="search-indexer pods OOMKilled 6 times in 30 minutes",
            log_query="memory",
            log_lines=(
                "WARN  heap 3.8 GiB of 4 GiB after GC; cache entries 2.1M and growing",
                "ERROR container killed: OOMKilled (limit 4 GiB)",
                "INFO  cache eviction disabled by feature flag search.cache.pin_all",
            ),
            deploys=(("v5.2.1", 4310, "j.ortiz"),),
            fix_action="restart",
            fix_target="search-indexer",
        ),
        Scenario(
            key="traffic-surge",
            title="Payments latency during a traffic surge",
            service="payments-gateway",
            alert="payments-gateway p99 latency above 2s for 10 minutes",
            log_query="queue",
            log_lines=(
                "WARN  request queue depth 1840 (limit 2000), 12 of 12 workers busy",
                "WARN  autoscaler at max replicas (6)",
                "INFO  traffic from campaign spring-sale up 3.1x since 09:00",
            ),
            deploys=(("v8.0.4", 9120, "m.chen"),),
            fix_action="scale_out",
            fix_target="12 replicas",
        ),
    )
}

SERVICES: dict[str, Scenario] = {s.service: s for s in SCENARIOS.values()}
ACTIONS = ("rollback", "restart", "scale_out")


def scenario_for_service(service: str) -> Scenario | None:
    return SERVICES.get(service)


def _jitter(seed: str, low: float, high: float) -> float:
    """A stable number in [low, high) for this seed."""
    digest = hashlib.sha256(seed.encode()).digest()
    fraction = int.from_bytes(digest[:4], "big") / 2**32
    return round(low + (high - low) * fraction, 1)


def metrics(s: Scenario, incident_key: str, healthy: bool) -> dict[str, float]:
    """Current metrics for the service; `healthy` is the state after the right fix."""
    if healthy:
        return {
            "p99_latency_ms": _jitter(incident_key + "p99ok", 180, 260),
            "error_rate_pct": _jitter(incident_key + "errok", 0.1, 0.4),
            "memory_pct": _jitter(incident_key + "memok", 40, 55),
            "requests_per_second": _jitter(incident_key + "rps", 900, 1100),
        }
    degraded = {
        "bad-deploy": {"p99_latency_ms": (2400, 3100), "error_rate_pct": (6, 9), "memory_pct": (45, 55)},
        "memory-leak": {"p99_latency_ms": (700, 950), "error_rate_pct": (1, 2), "memory_pct": (93, 98)},
        "traffic-surge": {"p99_latency_ms": (2100, 2600), "error_rate_pct": (0.5, 1.2), "memory_pct": (60, 70)},
    }[s.key]
    rps = (2800, 3400) if s.key == "traffic-surge" else (900, 1100)
    return {
        "p99_latency_ms": _jitter(incident_key + "p99", *degraded["p99_latency_ms"]),
        "error_rate_pct": _jitter(incident_key + "err", *degraded["error_rate_pct"]),
        "memory_pct": _jitter(incident_key + "mem", *degraded["memory_pct"]),
        "requests_per_second": _jitter(incident_key + "rps", *rps),
    }
