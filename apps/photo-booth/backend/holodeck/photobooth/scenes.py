"""Scene catalog and prompt templates for the Holo-Booth.

New captures use 24 equally used scene concepts in a persistent per-station deck.
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
          'an adventurous visitor in a magenta bomber jacket and teal trousers balancing a comically tall stack of glowing dumpling baskets on one hand at an orbital night-market stall, knees bent and the other arm stretched out for balance; a smiling alien vendor adds one last tiny basket while a hovering pet tries to steal a dumpling; steam, glowing lanterns, colorful ingredient jars, crowded balconies, passing spacecraft and a giant planet behind the glass roof fill the richly detailed scene',
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


EXPANDED_SCENES: list[Scene] = [
    Scene('pet_salon', 'pet_salon', 'Alien Pet Salon',
          'brushing the wildly springy fur of a friendly many-eyed alien pet in an orbital grooming salon, wearing teal overalls and a coral apron; rainbow soap bubbles escape, little grooming robots hold oversized combs and amused alien customers watch beside windows onto a jewel-colored moonport',
          'lab', 'poster'),
    Scene('planetarium_guide', 'planetarium_guide', 'Which Way Is Earth?',
          'acting as a delightfully confused planetarium guide in a violet uniform, holding an upside-down star chart while tiny alien schoolchildren float model planets around a spectacular domed star map; one child politely points out Earth behind the guide, with luminous constellations and a sweeping cosmic observatory in the background',
          'bridge', 'poster'),
    Scene('moon_bowling', 'moon_bowling', 'One Small Roll',
          'bowling in low gravity on a sparkling lunar bowling lane, wearing a lime-and-magenta leisure uniform; the glowing bowling ball drifts above the lane while friendly alien teammates gasp and the pins gently float apart; panoramic windows reveal a ringed planet, distant domes and a glittering crater city',
          'station_exterior', 'poster'),
    Scene('robot_orchestra', 'robot_orchestra', 'More Cowbell, Earthling',
          'conducting a tiny robot orchestra with two glowing batons while wearing a red-and-gold tailcoat on an alien garden stage; a kettle-shaped drummer enthusiastically overplays, little brass robots dance and luminous plants surround an audience of smiling extraterrestrials beneath a huge moon',
          'cantina', 'poster'),
    Scene('orbital_gardener', 'orbital_gardener', 'Houston, We Have Tomatoes',
          'tending a wildly overgrown orbital greenhouse in sunflower-yellow overalls, holding a watering can while a friendly tentacled plant steals a gardening glove; giant translucent leaves, floating droplets, rows of odd vegetables, little maintenance bots and station windows overlooking a striped planet create lush depth',
          'jungle', 'poster'),
    Scene('alien_birthday', 'alien_birthday', 'Surprise, Carbon-Based Friend',
          'being surprised at an alien birthday party in a turquoise party suit, leaning back laughing as a tiny friendly alien pops out of an absurdly tall luminous cake; party guests with whimsical silhouettes, floating confetti, star-shaped balloons and a warmly lit observation lounge overlook an orbital fireworks display',
          'cantina', 'poster'),
    Scene('moon_souvenirs', 'moon_souvenirs', 'It Was Smaller in the Gift Shop',
          'trying on an absurdly oversized asteroid-shaped souvenir hat in a moon gift shop, wearing a plum jacket and amber scarf while an alien shopkeeper holds a tiny mirror; bobblehead planets, floating snow globes, quirky postcards, crowded shelves and a panoramic crater promenade fill the colorful scene',
          'lab', 'poster'),
    Scene('fossil_excavation', 'fossil_excavation', 'The Smallest Brush in the Galaxy',
          'kneeling in a golden alien desert in copper and teal field gear, using a comically tiny brush to uncover an enormous spiral fossil while a curious fluffy alien assistant holds a magnifying glass backward; intricate fossil ribs, layered excavation terraces, distant sandstone ruins and two warm suns create sweeping cinematic scenery; no vehicle, saddle or handlebars',
          'desert', 'poster'),
    Scene('zero_g_juggler', 'zero_g_juggler', 'Gravity Was Not in the Contract',
          'attempting a zero-gravity juggling act in a magenta and silver performance suit as glowing fruit, soft juggling clubs and one confused rubbery alien float around both outstretched hands; delighted alien spectators peek from curved balconies in a vast orbital circus atrium overlooking a luminous planet; no vehicle, steering controls or saddle',
          'station_exterior', 'poster'),
    Scene('creature_ride', 'creature_ride', 'Friendly Alien Safari',
          'taking a playful ride on a gentle whimsical alien with an unusual non-equine silhouette through a richly detailed alien wilderness, wearing colorful expedition gear; no dragon, horse, cockpit, vehicle or handlebars',
          'jungle', 'poster'),
    Scene('creature_moth', 'creature_moth', 'Golden Moth Express',
          'gliding gently on the back of an enormous fuzzy golden alien moth with broad stained-glass wings, wearing a plum flight jacket and transparent bubble helmet with the whole recognizable face visible; the rider spreads both arms while luminous jellyfish trees, glowing seed clouds, misty waterfalls and a giant pink moon fill the valley; not a dragon, horse or mechanical vehicle',
          'jungle', 'visor'),
    Scene('creature_pillow', 'creature_pillow', 'The Mossback Scenic Route',
          'sitting sideways on a round moss-green six-legged pillow beast with huge umbrella-shaped ears, wearing a coral expedition coat; the friendly creature splashes through a violet marsh and sniffs a glowing lily, with luminous reeds, curious little amphibians, floating gardens and a ringed sunset planet behind; not a dragon, horse or mechanical vehicle',
          'jungle', 'poster'),
    Scene('creature_springhare', 'creature_springhare', 'One Giant Hop',
          'bouncing across low-gravity moon boulders on a giant coral-colored fluffy springhare with long antenna-like ears and a curled feathery tail, wearing a cobalt-and-yellow exploration suit; the laughing rider holds a fluttering scarf as pebble fountains, crystal craters and distant orbital arches stretch under an emerald aurora; not a dragon, horse or mechanical vehicle',
          'ringworld', 'poster'),
    Scene('creature_ray', 'creature_ray', 'The Balloon-Ray Drift',
          'drifting above a luminous canyon on a friendly pearlescent silver balloon-ray with a broad pancake body, tiny waving fins and a translucent inflated belly, wearing an orange suit and transparent bubble helmet showing the whole face; the rider lies on their stomach pointing ahead through suspended gardens, tiny drifting creatures and shimmering auroras; not a dragon, horse or mechanical vehicle',
          'ringworld', 'visor'),
    Scene('creature_snail', 'creature_snail', 'Express Service, Eventually',
          'perching on the spiral glass shell of an enormous friendly orange-spotted alien snail while reading a tiny map, wearing mint-green overalls and a violet scarf; the snail takes a leisurely route through a bustling botanical market, with neon fruit stalls, friendly aliens, hanging gardens and enormous orbital-city windows; not a dragon, horse or mechanical vehicle',
          'cantina', 'poster'),
    Scene('creature_caterpillar', 'creature_caterpillar', 'All Aboard the Velvet Caterpillar',
          'taking a gentle ride on a plum-colored velvety alien caterpillar with many tiny turquoise boots and little mushroom-like umbrellas along its back, wearing a sunflower-yellow raincoat; the rider laughs and reaches toward a sparkling droplet while the creature crosses an immense living root bridge between glowing mushroom towers and distant waterfalls; not a dragon, horse or mechanical vehicle',
          'jungle', 'poster'),
]

# Used when a provider refuses a scene twice (content policy). Deliberately bland.
FALLBACK = Scene("star_portrait", "fallback", "Starfarer Portrait",
                 "a proud space-academy graduate in a smart navy uniform, soft starfield and a distant blue planet behind",
                 "nebula", "hologram", ("#020412", "#0b1840"), {"accent": "#7b6cff", "tint_hue": None, "feature": ""})

BY_ID = {s.id: s for s in SCENES + PLAYFUL_SCENES + EXPANDED_SCENES + [FALLBACK]}
assert len({s.category for s in SCENES}) == len(SCENES), "categories must be unique"

# Curated for scenery and motion rather than static portraits. Retain the complete
# catalog above: older Workflow histories can still refer to any of those IDs.
FEATURED_SCENE_IDS = (
    "starfighter_ace", "kepler_explorer", "asteroid_miner", "ice_planet",
    "jungle_ranger", "desert_nomad", "grand_prix", "spacewalk",
)


PLAYFUL_SCENE_IDS = ('furry_first_contact', 'snack_chase', 'city_tourist', 'diner_counter', 'curious_spacewalk', 'street_food', 'zero_g_laundry', 'moon_picnic', 'robot_market')



# Retain the earlier pools and pickers unchanged for recorded Workflow histories.
# The current deck replaces similar vehicle prompts and the fixed blue dragon.
NEW_SCENE_IDS = ("pet_salon", "planetarium_guide", "moon_bowling", "robot_orchestra",
                 "orbital_gardener", "alien_birthday", "moon_souvenirs")
ROTATION_SCENE_IDS = tuple(sid for sid in FEATURED_SCENE_IDS if sid not in
                           ("desert_nomad", "grand_prix", "ice_planet")) + PLAYFUL_SCENE_IDS + NEW_SCENE_IDS + (
                           "fossil_excavation", "zero_g_juggler", "creature_ride")
RIDE_SCENE_IDS = ("starfighter_ace", "creature_ride")
CREATURE_SCENE_IDS = ("creature_moth", "creature_pillow", "creature_springhare",
                      "creature_ray", "creature_snail", "creature_caterpillar")
assert len(ROTATION_SCENE_IDS) == len(set(ROTATION_SCENE_IDS)) == 24

SCENE_COMPOSITIONS = {'pet_salon': 'a side-on knees-up view showing both hands, the enormous fluffy pet and the complete grooming table', 'planetarium_guide': 'a low-angle group view showing the standing guide from the knees up, the star chart and the circle of alien children', 'moon_bowling': 'a full-body three-quarter view of an exaggerated bowling follow-through, with the lane extending diagonally away', 'robot_orchestra': 'a waist-up frontal conductor view with both arms stretched wide and tiny musicians filling the foreground', 'orbital_gardener': 'a side-on full-body view reaching upward toward a towering cheeky plant, with the watering can and boots visible', 'alien_birthday': 'a seated three-quarter body view with both hands raised in surprise, the full cake and surrounding party guests', 'moon_souvenirs': 'a standing knees-up mirror view with the complete oversized hat, the person adjusting it with both hands and the shopkeeper', 'fossil_excavation': 'a wide three-quarter body view showing the kneeling pose, tiny brush, hands and immense fossil spiraling across the foreground', 'zero_g_juggler': 'a full-body floating view with spread legs and both arms reaching in different directions, surrounded by widely separated juggling props', 'creature_ride': 'a wide side-on view showing the rider from the knees up and the entire creature silhouette', 'creature_moth': 'a wide upward three-quarter view with the rider’s open arms and the moth’s entire spread-wing silhouette', 'creature_pillow': 'a side-on knees-up rider view showing the sideways seated pose, all six stubby legs and enormous round ears', 'creature_springhare': 'a broad full-body side view at the peak of a hop, with the rider leaning back and the creature’s two oversized hind feet visible', 'creature_ray': 'a wide elevated three-quarter view showing the prone rider, outstretched pointing hand and broad ray body floating over the canyon', 'creature_snail': 'a broad side view showing the upright map-reading rider, complete spiral shell and slow snail’s comically extended eye stalks', 'creature_caterpillar': 'a wide low-angle three-quarter view showing the rider’s reaching arm, curled knees and the caterpillar’s many tiny booted feet'}
SCENE_COMPOSITIONS.update({
    "starfighter_ace": "an over-the-shoulder cockpit view with the person looking back toward camera, both hands on the controls and the full canopy visible",
    "kepler_explorer": "a full-body airborne view showing bent knees, outstretched arms and the canyon gap beneath the explorer",
    "asteroid_miner": "a side-on knees-up work pose braced against a rock, with both arms holding the complete oversized plasma drill",
    "jungle_ranger": "a full-body diagonal swinging pose showing the overhead vine grip, extended legs and forest floor far below",
    "spacewalk": "a horizontal full-body tethered repair pose, one arm reaching toward an external ship panel and boots floating free",
    "furry_first_contact": "a crouching side view with both open hands beside the enormous nest and fluffy baby creature, rather than a riding pose",
    "snack_chase": "a full-body mid-stride comedy chase view with the visitor looking back and holding a sandwich above one shoulder",
    "city_tourist": "a standing knees-up tourist pose with both hands unfolding the large upside-down map and locals pointing around it",
    "diner_counter": "a seated side-on diner-counter view with elbows on the counter and the towering pancake stack beside the visitor's face",
    "curious_spacewalk": "an upright full-body floating group portrait with the visitor waving both hands and curious aliens gathered in a circle",
    "street_food": "a full-body balancing pose with bent knees, one hand supporting the complete towering stack of dumpling baskets and the other arm extended sideways",
    "zero_g_laundry": "a full-body upside-down floating pose reaching for an escaped sock among drifting laundry",
    "moon_picnic": "a full-body seated picnic pose with crossed legs, an outstretched hand accepting fruit and a crab stealing a sandwich",
    "robot_market": "a knees-up crouching shopping pose inspecting a tiny robot wearing a flowerpot hat, with one hand holding an odd souvenir",
})


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
         "Cinematic lighting, saturated jewel colors, rich detail, wide 16:9 landscape composition. "
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
    composition = scene.extras.get("composition") or SCENE_COMPOSITIONS.get(scene.id)
    if composition:
        body += (f" Camera and staging: {composition}. Show the defining body pose, both hands when visible, "
                 "and the complete distinguishing prop or creature; do not reduce this to a head-and-shoulders portrait. "
                 "Keep the face recognizable. The activity must be obvious even with the background hidden.")
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
                 appearance: str = "", soft: bool = False, style: str = "inspired", *, capture_key: str = "", frame_index: int = 0) -> str:
    """The prompt actually sent to the image model."""
    art = ""
    if capture_key:
        from .art_direction import varied_scene
        scene, art = varied_scene(scene, capture_key, frame_index)
    crew = face_count > 1
    if soft:
        prompt = soft_prompt(scene, crew)
    elif style == "photo":
        prompt = _photo(scene, framing, crew, appearance, usable)
    else:
        prompt = _inspired(scene, crew, appearance, usable)
    return f"{prompt} {art}".strip()
