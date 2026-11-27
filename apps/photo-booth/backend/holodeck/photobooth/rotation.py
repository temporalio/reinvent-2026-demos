"""Pure scene-deck planning; the spool commits each station's state atomically."""
from __future__ import annotations

import random
from .scenes import CREATURE_SCENE_IDS, RIDE_SCENE_IDS, ROTATION_SCENE_IDS

CATALOG_VERSION = "24-distinct-adventures-v1"


def shuffled_deck(rand, last_strip: list[str]) -> list[str]:
    """Use every concept once; separate rides and avoid a cycle-boundary repeat."""
    rides = list(RIDE_SCENE_IDS)
    others = [sid for sid in ROTATION_SCENE_IDS if sid not in rides]
    rand.shuffle(rides)
    rand.shuffle(others)
    strips: list[list[str]] = [[] for _ in range(len(ROTATION_SCENE_IDS) // 4)]
    for index, sid in zip(rand.sample(range(len(strips)), len(rides)), rides):
        strips[index].append(sid)
    for strip in strips:
        needed = 4 - len(strip)
        strip.extend(others[:needed])
        del others[:needed]
        rand.shuffle(strip)
    if set(strips[0]) & set(last_strip):
        # Four previous scenes cannot overlap all six disjoint strips.
        safe = [i for i, strip in enumerate(strips) if not set(strip) & set(last_strip)]
        first = rand.choice(safe)
        strips[0], strips[first] = strips[first], strips[0]
    return [sid for strip in strips for sid in strip]


def next_strip(previous: dict | None, rand=None) -> tuple[list[str], dict]:
    """Return four persisted scene IDs plus the next small, station-local state."""
    rand = rand or random.SystemRandom()
    state = dict(previous or {})
    if state.get("catalog") != CATALOG_VERSION:
        state = {"catalog": CATALOG_VERSION, "remaining": [], "last_strip": [],
                 "creatures": [], "last_creature": ""}
    remaining = list(state["remaining"])
    if not remaining:
        remaining = shuffled_deck(rand, state["last_strip"])
    slots = remaining[:4]
    state["remaining"], state["last_strip"] = remaining[4:], slots
    selected = list(slots)
    if "creature_ride" in selected:
        creatures = list(state["creatures"])
        if not creatures:
            creatures = list(CREATURE_SCENE_IDS)
            rand.shuffle(creatures)
            if creatures[0] == state["last_creature"]:
                creatures[0], creatures[1] = creatures[1], creatures[0]
        creature = creatures.pop(0)
        state["creatures"], state["last_creature"] = creatures, creature
        selected[selected.index("creature_ride")] = creature
    return selected, state


def scene_concept(scene_id: str) -> str:
    """Creature variants occupy one concept in the equally used 24-scene deck."""
    return "creature_ride" if scene_id in CREATURE_SCENE_IDS else scene_id
