"""Scene catalog and prompt templates for the Holo-Booth.

New strips draw four distinct scenes from a varied cinematic adventure pool.
The full 18-scene catalog and original picker stay available for old Workflow
histories. Both pickers use ``workflow.random()`` so replay preserves the choice.

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
          "a daring repair specialist swinging on a safety tether along the enormous curved hull of a starship, reaching toward a sparking holographic repair panel, with fleets of tiny ships, a luminous blue planet, shimmering orbital rings and a sunrise across the horizon; show the whole action and sweeping space scenery",
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
          "a desert trailblazer in colorful flowing expedition gear leaning a hover-bike into a sharp turn through immense golden dunes, kicking up a glowing dust trail, with towering sandstone arches, an ancient cliffside city, other tiny riders and two setting suns beneath a huge crescent moon",
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

PLAYFUL_SCENES: list[Scene] = [
    Scene('furry_first_contact', 'alien_nest', 'First Contact, Extra Fluffy',
          'a delighted explorer in a plum-purple field jacket and amber bubble helmet, face clearly visible through the transparent visor, kneeling beside an enormous woven nest to meet a friendly baby bird-like alien with fluffy mint fur, oversized paws and curious sparkling eyes; tiny siblings peek out among luminous leaves, huge flowers, suspended vines and misty waterfalls on a lush alien mountainside',
          'jungle', 'visor', ('#102b32', '#a056af')),
    Scene('snack_chase', 'comic_chase', 'That Was Its Sandwich',
          'a startled but laughing visitor in a bright tangerine jumpsuit sprinting through a bustling alien street while a large goofy toothy alien lumbers behind, trying to reclaim its oversized sandwich; the creature looks mildly scary in a silly cartoon way, not threatening, with bouncing cheeks and untied sneakers; market umbrellas fly up, amused aliens step aside and noodle stalls, layered skybridges and pastel towers fill the sunset city; no injury, horror or gore',
          'cantina', 'poster', ('#21164b', '#fa916b')),
    Scene('city_tourist', 'alien_city_tour', 'Wish You Were Here',
          'a cheerful tourist in a turquoise jacket, coral scarf and small travel backpack unfolding an absurdly complicated holographic map upside down while friendly alien locals point in three different directions; an immense walkable alien city stretches behind them with stacked balconies, floating trams, sculptural towers, tiny rooftop gardens, glowing shop windows and a violet sky with two moons',
          'bridge', 'poster', ('#1b1240', '#589dc8')),
    Scene('diner_counter', 'alien_diner', 'The Usual, Earthling?',
          'a bemused traveler in a cherry-red flight uniform sitting on a chrome stool at an eat-at counter in a cozy retro-futurist alien diner; a friendly many-armed cook serves an impossibly tall pancake stack while a tiny fluffy customer tries to steal a berry; turquoise booths, copper espresso pipes, hovering plates, jewel-colored neon reflections and a panoramic window overlooking a busy moon spaceport create deep detailed scenery',
          'cantina', 'poster', ('#162535', '#b86e83')),
    Scene('curious_spacewalk', 'curious_aliens', 'Personal Space, Please',
          'a laughing astronaut in a cobalt and sunflower-yellow suit floating on a safety tether outside an enormous space station, their recognizable face clearly visible inside a transparent spherical bubble helmet; a ring of curious friendly alien visitors in colorful little space pods examines their boots and copies their wave, one holding a tiny camera; station gardens, docking ships, a turquoise ringed planet, violet nebulae and a sunrise fill the vast background',
          'station_exterior', 'visor', ('#051631', '#9657b7')),
    Scene('street_food', 'orbital_street_food', 'One Small Bite for Humanity',
          'an adventurous visitor in a magenta bomber jacket and teal trousers sampling a floating alien noodle with comic surprise at an orbital night-market stall; a smiling alien vendor demonstrates with four chopsticks while a tiny hovering pet begs for a bite; steam, glowing lanterns, colorful ingredient jars, crowded balconies, passing spacecraft and a giant planet behind the glass roof fill the richly detailed scene',
          'cantina', 'poster', ('#311b40', '#da8c55')),
    Scene('zero_g_laundry', 'orbital_laundromat', 'Spin Cycle in Zero-G',
          'a laughing visitor in a lime-green utility suit with lilac patches floating inside a zero-gravity laundromat, trying to catch an escaped sock while friendly round aliens chase floating laundry; transparent washer bubbles, swirling rainbow socks, copper machinery, potted alien plants and enormous windows onto an orbital city create a funny everyday space adventure with sweeping depth',
          'station_exterior', 'porthole', ('#163843', '#9958c7')),
    Scene('moon_picnic', 'moon_beach', 'Lunch with a View',
          'a relaxed explorer in a mustard-yellow and seafoam expedition suit with an open transparent bubble helmet, face fully visible, sitting at a picnic blanket on a glittering alien moon beach while a friendly crab-like alien politely offers a glowing fruit and steals a sandwich with another claw; pink waves, lavender sand dunes, tiny tidepool creatures, distant basalt arches and an enormous ringed planet create lush cinematic scenery',
          'ringworld', 'visor', ('#29365b', '#d67e8e')),
    Scene('robot_market', 'robot_market', 'Some Assembly Required',
          'an amused visitor in a sapphire-blue coverall and bright coral vest browsing a crowded alien flea market while a small friendly robot proudly models a ridiculous flowerpot hat; other aliens barter for curious household gadgets, with detailed stalls, dangling glowing cables, whimsical sculptures, stacked terraces, distant airships and warm golden light across a vast futuristic plaza',
          'lab', 'poster', ('#1e2a4e', '#c28d54')),

]

# Used when a provider refuses a scene twice (content policy). Deliberately bland.
FALLBACK = Scene("star_portrait", "fallback", "Starfarer Portrait",
                 "a proud space-academy graduate in a smart navy uniform, soft starfield and a distant blue planet behind",
                 "nebula", "hologram", ("#020412", "#0b1840"), {"accent": "#7b6cff", "tint_hue": None, "feature": ""})

BY_ID = {s.id: s for s in SCENES + PLAYFUL_SCENES + [FALLBACK]}
assert len({s.category for s in SCENES}) == len(SCENES), "categories must be unique"

# Curated for scenery and motion rather than static portraits. Retain the complete
# catalog above: older Workflow histories can still refer to any of those IDs.
FEATURED_SCENE_IDS = (
    "starfighter_ace", "kepler_explorer", "asteroid_miner", "ice_planet",
    "jungle_ranger", "desert_nomad", "grand_prix", "spacewalk",
)


PLAYFUL_SCENE_IDS = ('furry_first_contact', 'snack_chase', 'city_tourist', 'diner_counter', 'curious_spacewalk', 'street_food', 'zero_g_laundry', 'moon_picnic', 'robot_market')


def pick_playful_four(rand) -> list[str]:
    """Blend playful encounters and original adventures, with no repeat setting."""
    return rand.sample((*FEATURED_SCENE_IDS, *PLAYFUL_SCENE_IDS), 4)


def pick_featured_four(rand) -> list[str]:
    """Pick four different adventures and their order using Workflow randomness."""
    return rand.sample(FEATURED_SCENE_IDS, 4)


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

_TAIL = ("Casual, funny, welcoming and family-friendly; any scares are mild cartoon slapstick, never horror, injury or gore. "
         "Cinematic lighting, saturated jewel colors, rich detail, wide 3:2 landscape composition. "
         "Build an immersive environment with distinct foreground, midground and distant scenery; "
         "the environment should fill most of the image around the recognizable character. "
         "Use a dynamic three-quarter or medium-wide camera angle, expressive movement and depth. "
         "Render polished cinematic adventure key art, with colorful varied uniforms and spacesuits, transparent bubble helmets when appropriate with the entire recognizable face visible, detailed costumes, dramatic rim light, "
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
