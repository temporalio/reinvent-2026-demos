"""Scene catalog and prompt templates for the Holo-Booth.

18 scenes, each in its own setting category. A strip takes 4 scenes with 4
different categories and at most one transformation-type frame (and at most
one "at the controls" frame), chosen with ``workflow.random()`` so replays are
deterministic.

Two prompt styles (HOLODECK_PHOTOBOOTH_STYLE):
- ``inspired`` (default): the photo is a likeness reference for a brand-new
  cinematic scene with its own pose, camera angle, lighting and costume.
- ``photo``: edit the visitor's actual photo, keeping its pose and framing.

Each scene also has a mock recipe (``backdrop`` + ``frame``) for the offline renderer.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Scene:
    id: str
    category: str  # unique setting category
    title: str
    action: str  # what the hero is doing, where; shared by both prompt styles
    backdrop: str  # mock: scenery painter
    frame: str  # mock: how the photo is shown (visor, screen, porthole, hologram, poster)
    sky: tuple[str, str] = ("#0b0630", "#2a0f5e")
    extras: dict = field(default_factory=dict)
    transform: bool = False  # turns the visitor into something (max one per strip)
    family: str = ""  # scenes in the same family are too alike to share a strip


SCENES: list[Scene] = [
    Scene("starfighter_ace", "cockpit", "Starfighter Ace",
          "a starfighter ace banking hard through a crowded asteroid field during a friendly starship chase, one hand on a glowing flight stick, a wide canopy revealing immense orbital cities, colorful nebulae, streaking meteors and other ships",
          "warp", "screen", ("#000010", "#101a4a"), {"hud": "#59fdd0", "label": "TEMPORAL-1"}, family="helm"),
    Scene("bridge_captain", "bridge", "Captain on the Bridge",
          "a starship captain standing tall on a vast command bridge, giving orders in front of a giant viewscreen showing a ringed planet",
          "bridge", "screen", ("#050a1e", "#1d2b5c"), {"hud": "#ffb547", "label": "BRIDGE · DECK 1"}, family="helm"),
    Scene("mech_pilot", "mech", "Mech Commander",
          "piloting a towering friendly battle mech, hatch open, striding across a neon hangar bay",
          "mech", "screen", ("#140a1e", "#3a1d5c"), {"hud": "#ff6b7a", "label": "MECH-07"}, family="helm"),
    Scene("kepler_explorer", "planet_explorer", "Explorer of Kepler-T",
          "an explorer in colorful, weathered expedition armor leaping across a glowing canyon on an orange alien world, with floating islands, waterfalls, strange plants, distant ruins and a gigantic ringed planet filling the horizon",
          "ringworld", "visor", ("#1a0b2e", "#ff8a4c"), {"ground": "#6b2e1a", "planet": "#ffcf7a"}),
    Scene("slug_patrol", "creature_battle", "Space Slug Patrol",
          "a space ranger in colorful armored gear sliding across rocky terrain while aiming a glowing toy-like blaster toward goofy giant green space slugs, surrounded by alien ruins, sparkling energy trails, tangled luminous plants and two suns (playful cartoon action, no gore)",
          "slugs", "visor", ("#003333", "#3fbfa0"), {"ground": "#0d3b2e"}),
    Scene("zero_g", "zero_g_station", "Zero-G Coffee Break",
          "floating weightless inside a cozy space station module, a wobbling coffee blob and snacks drifting by, a blue planet glowing in the big window",
          "station_exterior", "porthole", ("#020412", "#0b1840"), {"planet": "#3a8dff"}),
    Scene("spacewalk", "spacewalk", "Spacewalk Repair Crew",
          "on a daring spacewalk, tethered to the hull of a huge starship, tightening a glowing panel with Earth-like planet below",
          "hull", "visor", ("#000008", "#0a1030"), {"planet": "#2f7de0"}),
    Scene("asteroid_miner", "asteroid_miner", "Asteroid Miner",
          "an asteroid adventurer bracing against a tumbling crystal-covered rock while wielding a spectacular glowing plasma drill, surrounded by flying crystal shards, molten mineral seams, immense orbital mining rigs, distant planets and a turbulent star-filled nebula",
          "asteroids", "visor", ("#0a0a12", "#2a2438"), {"rock": "#6b6078", "crystal": "#59fdd0"}),
    Scene("ice_planet", "ice_planet", "Ice Planet Trailblazer",
          "a fur-clad trailblazer leaning forward and pointing toward the horizon while riding a friendly blue snow-dragon at speed, through towering crystalline ice arches, blowing snow, distant frozen citadels and enormous colorful auroras",
          "ice", "visor", ("#0a1a3a", "#7fd3ff"), {"ground": "#dff4ff"}),
    Scene("jungle_ranger", "alien_jungle", "Alien Jungle Ranger",
          "an adventurous ranger swinging toward the viewer on a vine through a sprawling alien jungle, with giant glowing mushroom canopies, curious floating jellyfish creatures, cascading waterfalls, colorful spores and ancient ruins extending deep into the distance",
          "jungle", "poster", ("#021a12", "#0c5a3a"), {"accent": "#b6ff5c", "shape": "oval"}),
    Scene("desert_nomad", "desert_world", "Twin-Sun Desert Nomad",
          "a hooded desert nomad on a hover-bike racing across golden dunes under two setting suns",
          "desert", "poster", ("#3a1a0a", "#ffb547"), {"accent": "#ffd28a", "shape": "oval"}),
    Scene("cantina", "cantina", "Cantina Legend",
          "the coolest regular at a neon-lit space cantina, raising a glowing drink with a band of friendly aliens playing behind them",
          "cantina", "poster", ("#1a0612", "#4a1030"), {"accent": "#ff7ae0", "shape": "rounded", "label": "CANTINA"}),
    Scene("grand_prix", "space_race", "Galactic Grand Prix Racer",
          "a galactic rally racer leaning into a sharp turn in a colorful open-cockpit hover-racer, overtaking rival racers on a suspended track through a spectacular alien canyon, with plasma trails, floating grandstands, waterfalls and distant ringed planets; show the race in motion, never a trophy ceremony or podium",
          "desert", "poster", ("#07071a", "#26206b"), {"accent": "#ffd23f", "shape": "rounded", "label": "CHAMPION"}),
    Scene("holo_message", "hologram", "Holo-Message from HQ",
          "a full character made of shimmering blue holographic light striding across a vast command deck to deliver an urgent mission briefing, with towering projected star maps, miniature orbiting planets, energetic crew members and a sweeping view of a luminous nebula",
          "nebula", "hologram", ("#001a33", "#0a4d8c"), {"accent": "#5ec8ff", "tint_hue": 0.55, "feature": ""}),
    Scene("zorblaxian", "alien_transformation", "Zorblaxian Ambassador",
          "transformed into a friendly green-skinned alien ambassador with two springy antennae and a shimmering silver collar, greeting visitors in front of a purple nebula",
          "nebula", "hologram", ("#12002b", "#5b1a8f"), {"accent": "#b6ff5c", "tint_hue": 0.28, "feature": "antennae"}, transform=True),
    Scene("nebulon", "alien_oracle", "Nebulon Oracle",
          "transformed into a serene blue-skinned alien oracle with a glowing third eye and star freckles, guiding a glowing celestial map across a vast cosmic temple with floating stone bridges, radiant waterfalls and distant galaxies",
          "nebula", "hologram", ("#001a33", "#0a4d8c"), {"accent": "#7fd3ff", "tint_hue": 0.6, "feature": "third_eye"}, transform=True),
    Scene("vexari", "crystal_being", "Crystalline Vexari",
          "transformed into a magenta crystal being with sparkling crystal spikes on the head and softly glowing skin, striding across an enormous crystal cavern, with radiant crystal forests, luminous underground rivers and distant suspended bridges",
          "nebula", "hologram", ("#2b0022", "#8c1a6b"), {"accent": "#ff7ae0", "tint_hue": 0.86, "feature": "crystals"}, transform=True),
    Scene("android", "android", "Chrome Android Upgrade",
          "transformed into a gleaming friendly chrome android with glowing circuit lines, leaping between moving platforms in a vast futuristic robotics workshop, surrounded by articulated machines, holographic schematics and windows overlooking an immense neon city",
          "lab", "hologram", ("#0a0f14", "#23313d"), {"accent": "#59fdd0", "tint_hue": 0.52, "feature": "circuits"}, transform=True),
]

# Used when a provider refuses a scene twice (content policy). Deliberately bland.
FALLBACK = Scene("star_portrait", "fallback", "Starfarer Portrait",
                 "a proud space-academy graduate in a smart navy uniform, soft starfield and a distant blue planet behind",
                 "nebula", "hologram", ("#020412", "#0b1840"), {"accent": "#7b6cff", "tint_hue": None, "feature": ""})

BY_ID = {s.id: s for s in SCENES + [FALLBACK]}
assert len({s.category for s in SCENES}) == len(SCENES), "categories must be unique"


def pick_four(rand) -> list[str]:
    """4 scenes, 4 different categories, at most one transformation and one per family.

    ``rand`` must be ``workflow.random()`` so the choice is deterministic on replay.
    """
    pool = list(SCENES)
    rand.shuffle(pool)
    chosen: list[Scene] = []
    for s in pool:
        if any(c.category == s.category for c in chosen):
            continue
        if s.transform and any(c.transform for c in chosen):
            continue
        if s.family and any(c.family == s.family for c in chosen):
            continue
        chosen.append(s)
        if len(chosen) == 4:
            break
    return [s.id for s in chosen]


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_TAIL = ("Fun, heroic and family-friendly; any action is cartoonish with no gore. "
         "Cinematic lighting, saturated jewel colors, rich detail, wide 3:2 landscape composition. "
         "Build an immersive environment with distinct foreground, midground and distant scenery; "
         "the environment should fill most of the image around the recognizable character. "
         "Use a dynamic three-quarter or medium-wide camera angle, expressive movement and depth. "
         "Render polished cinematic adventure key art, with detailed costumes, dramatic rim light, "
         "atmosphere and colorful environmental effects. No plain studio background, empty white "
         "spacesuit portrait, podium portrait, pasted photo, face cutout, inset headshot, ID card, "
         "decorative photo frame or giant floating head. Do not render titles, labels or watermarks.")


def _inspired(scene: Scene, crew: bool, appearance: str, usable: bool) -> str:
    who = ("characters who look very much like the people in the reference photo: each one's face, hairstyle and "
           "facial hair clearly recognisable as them, together as a crew") if crew else \
          ("a character who looks very much like the person in the reference photo: the same face, hairstyle and "
           "facial hair, instantly recognisable as them")
    hero = "The heroes are" if crew else "The hero is"
    body = (f"Create a brand-new cinematic sci-fi adventure scene (direction: {scene.title}): {scene.action}. {hero} {who}.")
    if scene.transform:
        body += " Even transformed, keep their face shape, features and hairstyle recognisable."
    if appearance and usable:
        body += f" Keep visible details from the photo: {appearance.strip().rstrip('.')}."
    body += (" Invent a new pose, camera angle, lighting and costume that suit the scene; do not copy the photo's"
             " pose, background or clothing.")
    if not usable:
        body += " If no face is clearly visible in the reference photo, invent a friendly cartoon astronaut hero instead."
    return f"{body} {_TAIL}"


def _photo(scene: Scene, framing: str, crew: bool, appearance: str, usable: bool) -> str:
    who = "these people" if crew else "this person"
    body = (f"Edit this photo into a sci-fi scene titled '{scene.title}': show {who} as {scene.action}. "
            f"Keep {'each' if crew else 'the'} person's face, expression, pose and identity clearly recognisable.")
    if framing == "head_only":
        body += " Keep the tight head-and-face framing."
    if crew:
        body += " Include everyone from the photo."
    if appearance and usable:
        body += f" Keep visible details: {appearance.strip().rstrip('.')}."
    if not usable:
        body += " If no person is clearly visible in the photo, create a friendly cartoon astronaut character in their place."
    return f"{body} {_TAIL}"


def soft_prompt(scene: Scene, crew: bool = False) -> str:
    """Gentler wording for a retry after a content-policy refusal: no weapons,
    no transformation, just a cheerful costume and setting."""
    who = "the people in the reference photo, recognisable as them" if crew else \
          "a character who looks like the person in the reference photo"
    return (f"A cheerful, family-friendly sci-fi portrait themed '{scene.title}' featuring {who}, "
            f"in a colorful space costume with a friendly {scene.category.replace('_', ' ')} setting. "
            f"No weapons or combat. Show an expressive, adventurous moment in a richly detailed alien landscape with foreground and distant scenery, not a static studio portrait. {_TAIL}")


def scene_prompt(scene: Scene, framing: str = "head_shoulders", face_count: int = 1, usable: bool = True,
                 appearance: str = "", soft: bool = False, style: str = "inspired") -> str:
    """The prompt actually sent to the image model."""
    crew = face_count > 1
    if soft:
        return soft_prompt(scene, crew)
    if style == "photo":
        return _photo(scene, framing, crew, appearance, usable)
    return _inspired(scene, crew, appearance, usable)
