"""Capture-specific art direction; stable retries, varied outfits and scenery."""
from __future__ import annotations

from dataclasses import dataclass, replace
from hashlib import sha256
import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .scenes import Scene

# Independent shuffled pools give the four frames different silhouettes and colors.
OUTFITS = (
    'a sleek paneled exploration jumpsuit with full gloves',
    'a lightweight botanical field tunic, leggings and bare hands',
    'a quilted expedition vest over a technical undersuit with full gloves',
    'a flowing utility poncho over fitted trousers and bare hands',
    'a structured high-collar flight uniform with full gloves',
    'a short asymmetrical rain cape over hiking gear and bare hands',
    'a streamlined soft-shell space suit with full gloves',
    'a sporty zip jacket, wide utility trousers and bare hands',
)
PALETTES = (
    ('emerald green and fuchsia', 'deep plum scenery with luminous emerald and rose details'),
    ('violet and lemon yellow', 'golden ochre scenery with violet shadows and lime details'),
    ('crimson and mint green', 'dark jade scenery with coral and mint details'),
    ('cobalt and coral pink', 'burgundy scenery with cobalt and peach details'),
    ('hot pink and charcoal', 'deep indigo scenery with magenta and gold details'),
    ('lemon yellow and royal purple', 'dark teal scenery with yellow and purple details'),
    ('turquoise and raspberry red', 'warm terracotta scenery with turquoise and raspberry details'),
    ('pearl silver and lime green', 'aubergine scenery with silver and chartreuse details'),
)
LIGHTING = (
    'soft peach dawn with long lavender shadows',
    'a warm amber sunset with rich emerald shadows',
    'a luminous night lit by magenta plants and golden lanterns',
    'diffuse green-gold canopy light with shafts through drifting pollen',
    'dramatic violet twilight with pink reflections',
    'crisp neutral daylight with saturated colors and clear distant detail',
    'rosy light after a rain shower with jewel-colored reflections',
    'soft golden side lighting and deep plum atmospheric layers',
)
JUNGLE_ACTIONS = (
    ('swinging sideways on a vine across a lush alien ravine',
     'side-on medium-wide view of the swinging body, both hands gripping the vine, scenery beneath'),
    ('stepping with one knee raised over a huge fallen log while a tiny furry alien peeks out',
     'low three-quarter view showing the raised knee, complete fallen log and peeking alien'),
    ('ducking with bent knees beneath an overhanging flowering branch, lifting it gently with one hand',
     'medium-wide view showing the crouched body, lifted branch and visible face looking toward camera'),
    ('hopping across a small gap between two mossy rocks above a shallow glowing stream',
     'side-on wide view showing both rocks, the little gap and the whole body safely mid-hop'),
    ('balancing with arms spread while crossing an enormous twisting root over a bed of luminous ferns',
     'three-quarter wide view showing both arms, feet on the root and the complete root crossing'),
    ('parting enormous translucent leaves to discover a tiny alien village nestled inside a tree',
     'medium-wide view showing both hands opening the leaves, the face and the miniature village'),
)
JUNGLE_WORLDS = (
    'a scarlet fern forest with giant seed pods, violet tree bark and golden pollen',
    'a golden bamboo grove with floating orchid islands, jade moss and peach mist',
    'a plum-colored rainforest with luminous lime roots and little amber pools',
    'a coral cloud forest with translucent pink leaves and distant ruby mountains',
    'a deep emerald canyon garden with yellow flowers and hanging copper vines',
    'a midnight garden of magenta mushrooms, silver grasses and warm firefly swarms',
)

# Remove authored fixed wardrobe instructions before inserting a new outfit.
# Scene actions and defining props remain intact; colors of aliens are untouched.
FIXED_WARDROBES = (
    'in a plum-purple field jacket and amber bubble helmet, face clearly visible through the transparent visor, ',
    'in a bright tangerine jumpsuit ', 'in a turquoise jacket, coral scarf and small travel backpack ',
    'in a cherry-red flight uniform ', 'in a cobalt and sunflower-yellow suit ',
    'in a magenta bomber jacket and teal trousers ', 'in a lime-green utility suit with lilac patches ',
    'in a mustard-yellow and seafoam expedition suit with an open transparent bubble helmet, face fully visible, ', 'in a sapphire-blue coverall and bright coral vest ',
    'wearing teal overalls and a coral apron', 'in a violet uniform',
    'wearing a lime-and-magenta leisure uniform', 'wearing a red-and-gold tailcoat',
    'in sunflower-yellow overalls', 'in a turquoise party suit',
    'wearing a plum jacket and amber scarf', 'in copper and teal field gear',
    'in a magenta and silver performance suit', 'wearing colorful expedition gear',
    'wearing a plum flight jacket and transparent bubble helmet with the whole recognizable face visible',
    'wearing a coral expedition coat', 'wearing a cobalt-and-yellow exploration suit',
    'wearing an orange suit and transparent bubble helmet showing the whole face',
    'wearing mint-green overalls and a violet scarf', 'wearing a sunflower-yellow raincoat',
    'in colorful, weathered expedition armor ', 'in colorful armored gear ',
    'in colorful flowing expedition gear ',
)


@dataclass(frozen=True)
class ArtDirection:
    outfit: str
    palette: tuple[str, str]
    lighting: str
    jungle_action: tuple[str, str]
    jungle_world: str


def direction_for(capture_key: str, frame_index: int) -> ArtDirection:
    """Use opaque capture identity, never attendee identity, to vary each strip."""
    rand = random.Random(int.from_bytes(sha256(capture_key.encode()).digest(), 'big'))
    choices = []
    for pool in (OUTFITS, PALETTES, LIGHTING, JUNGLE_ACTIONS, JUNGLE_WORLDS):
        options = list(pool)
        rand.shuffle(options)
        choices.append(options[frame_index % len(options)])
    return ArtDirection(*choices)


def varied_scene(scene: Scene, capture_key: str, frame_index: int) -> tuple[Scene, str]:
    """Replace fixed styling while preserving the selected scene's activity."""
    direction = direction_for(capture_key, frame_index)
    action = scene.action
    for fixed in FIXED_WARDROBES:
        action = action.replace(fixed, '')
    extras = dict(scene.extras)
    if scene.id == 'jungle_ranger':
        action = f'an adventurous explorer {direction.jungle_action[0]} in {direction.jungle_world}; friendly curious alien wildlife and layered scenery stretch into the distance'
        extras['composition'] = direction.jungle_action[1]
    wardrobe = f'{direction.outfit}, colored {direction.palette[0]}'
    art = (
        f'Capture-specific wardrobe: {wardrobe}. Use varied fabric shapes, seams and accessories. '
        'No brown leather adventurer outfit, orange/brown default spacesuit or fingerless gloves. '
        'Use a transparent bubble helmet when the setting requires one; keep the entire face clearly visible. '
        f'Environment art direction: {direction.palette[1]}; lighting: {direction.lighting}. '
        'Reinterpret the scene in that palette, rather than defaulting to a pale blue/white background '
        'or the same generic blue-purple nebula. Keep rich detailed foreground, middle distance and background. '
        'Preserve face, hairstyle, facial hair and recognizable eyewear from the reference; '
        'replace reference clothing, hats and gloves with this wardrobe. '
        'Keep the defining scene action and props; all crew members remain recognizable.'
    )
    return replace(scene, action=action, extras=extras), art
