"""Ziggy's starship: the simulated systems the engineering agent investigates and repairs.

This is demo machinery, not part of the Temporal pattern. Each incident arrives
as data in the Workflow's input (the API has Claude Haiku write a fresh set of
shipboard emergencies for every visitor), so the tools need no network:
AgentCore runs the Worker outside any cluster. Every reading is derived from
the incident's Workflow ID, so the same incident always shows the same numbers,
on any Worker and on any retry.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

# What went wrong decides which repair works. The evidence follows the cause:
# a bad update shows a firmware push minutes before the alert, wear shows a hot
# core on old firmware, and overload shows load far above rated capacity.
REPAIRS = {"bad_update": "rollback", "wear": "power_cycle", "overload": "reroute_power"}
ACTIONS = tuple(REPAIRS.values())


@dataclass
class Update:
    version: str
    minutes_ago: int
    crew: str


@dataclass
class Scenario:
    key: str
    title: str
    system: str
    alert: str
    cause: str
    log_lines: list[str] = field(default_factory=list)
    updates: list[Update] = field(default_factory=list)  # newest first
    fix_target: str = ""

    @property
    def fix_action(self) -> str:
        return REPAIRS[self.cause]


def _jitter(seed: str, low: float, high: float) -> float:
    """A stable number in [low, high) for this seed."""
    digest = hashlib.sha256(seed.encode()).digest()
    fraction = int.from_bytes(digest[:4], "big") / 2**32
    return round(low + (high - low) * fraction, 1)


DEGRADED = {
    "bad_update": {"output_pct": (38, 60), "fault_rate_pct": (6, 12), "core_temp_c": (70, 85), "load_pct": (90, 110)},
    "wear": {"output_pct": (55, 70), "fault_rate_pct": (1, 3), "core_temp_c": (140, 175), "load_pct": (95, 105)},
    "overload": {"output_pct": (70, 80), "fault_rate_pct": (0.5, 1.5), "core_temp_c": (95, 110), "load_pct": (260, 320)},
}
NOMINAL = {"output_pct": (97, 100), "fault_rate_pct": (0.1, 0.4), "core_temp_c": (60, 72), "load_pct": (85, 100)}


def telemetry(s: Scenario, incident_key: str, healthy: bool) -> dict[str, float]:
    """The system's readings now; `healthy` is the state after the right repair."""
    ranges = NOMINAL if healthy else DEGRADED[s.cause]
    tag = "ok" if healthy else ""
    return {name: _jitter(incident_key + name + tag, low, high) for name, (low, high) in ranges.items()}
