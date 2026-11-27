# Photo Booth scene rotation

Each booth gets a shuffled deck of **24 scene concepts**: four per capture,
six strips before the deck is exhausted and reshuffled. Every concept is used
once per cycle. The first strip of a new cycle avoids the previous strip’s
concepts. The cockpit and creature-riding concepts go on different strips.

The hover-bike and hover-racer are replaced by fossil excavation and a
zero-gravity juggling mishap. The fixed blue dragon is replaced by a creature
slot with six separately rotated species. Prompts specify different poses,
framing and prominent props, with a recognizable face and rich scenery.

## The 24 concepts

| Scene | Distinguishing pose or action |
| --- | --- |
| Starfighter Ace | An over-the-shoulder cockpit view with the person looking back toward camera, both hands on the controls and the full canopy visible. |
| Explorer of Kepler-T | A full-body airborne view showing bent knees, outstretched arms and the canyon gap beneath the explorer. |
| Asteroid Miner | A side-on knees-up work pose braced against a rock, with both arms holding the complete oversized plasma drill. |
| Alien Jungle Ranger | A full-body diagonal swinging pose showing the overhead vine grip, extended legs and forest floor far below. |
| Spacewalk Repair Crew | A horizontal full-body tethered repair pose, one arm reaching toward an external ship panel and boots floating free. |
| First Contact, Extra Fluffy | A crouching side view with both open hands beside the enormous nest and fluffy baby creature, rather than a riding pose. |
| That Was Its Sandwich | A full-body mid-stride comedy chase view with the visitor looking back and holding a sandwich above one shoulder. |
| Wish You Were Here | A standing knees-up tourist pose with both hands unfolding the large upside-down map and locals pointing around it. |
| The Usual, Earthling? | A seated side-on diner-counter view with elbows on the counter and the towering pancake stack beside the visitor's face. |
| Personal Space, Please | An upright full-body floating group portrait with the visitor waving both hands and curious aliens gathered in a circle. |
| One Small Bite for Humanity | A full-body balancing pose with bent knees, one hand supporting the complete towering stack of dumpling baskets and the other arm extended sideways. |
| Spin Cycle in Zero-G | A full-body upside-down floating pose reaching for an escaped sock among drifting laundry. |
| Lunch with a View | A full-body seated picnic pose with crossed legs, an outstretched hand accepting fruit and a crab stealing a sandwich. |
| Some Assembly Required | A knees-up crouching shopping pose inspecting a tiny robot wearing a flowerpot hat, with one hand holding an odd souvenir. |
| Alien Pet Salon | A side-on knees-up view showing both hands, the enormous fluffy pet and the complete grooming table. |
| Which Way Is Earth? | A low-angle group view showing the standing guide from the knees up, the star chart and the circle of alien children. |
| One Small Roll | A full-body three-quarter view of an exaggerated bowling follow-through, with the lane extending diagonally away. |
| More Cowbell, Earthling | A waist-up frontal conductor view with both arms stretched wide and tiny musicians filling the foreground. |
| Houston, We Have Tomatoes | A side-on full-body view reaching upward toward a towering cheeky plant, with the watering can and boots visible. |
| Surprise, Carbon-Based Friend | A seated three-quarter body view with both hands raised in surprise, the full cake and surrounding party guests. |
| It Was Smaller in the Gift Shop | A standing knees-up mirror view with the complete oversized hat, the person adjusting it with both hands and the shopkeeper. |
| The Smallest Brush in the Galaxy | A wide three-quarter body view showing the kneeling pose, tiny brush, hands and immense fossil spiraling across the foreground. |
| Gravity Was Not in the Contract | A full-body floating view with spread legs and both arms reaching in different directions, surrounded by widely separated juggling props. |
| Friendly Alien Safari | A wide side-on view showing the rider from the knees up and the entire creature silhouette. |

## Creature variations

Each species is used once before this smaller deck reshuffles:

- Golden Moth Express
- The Mossback Scenic Route
- One Giant Hop
- The Balloon-Ray Drift
- Express Service, Eventually
- All Aboard the Velvet Caterpillar

The species are a golden moth, moss-green six-legged pillow beast, coral
springhare, silver balloon-ray, orange snail, and plum caterpillar. They are
separate illustrated creature designs, rather than recolored blue dragons.

## Persistence and recovery

The station ID comes from the booth URL and its `X-Station` request header.
Local mode keeps the deck beside the capture spool in its retained Docker data
volume. Hosted mode uses the existing `CONTROL_TABLE` and pod role, under
`photobooth#scene-deck#<station>` keys. The table keeps scene state through API
pod/database replacement; no new AWS resource or secret is required.

Scene IDs are saved with the capture before its Workflow starts. Retrying the
same capture keeps its reservation. The hosted store uses conditional writes to
handle concurrent reservations and remembers the last 128 capture reservations
per booth. Only opaque capture IDs and scene IDs are stored there, not photos
or email addresses. An unavailable hosted store fails the reservation visibly;
it does not silently start another local deck.

Online and local/offline runtimes maintain separate decks. A reservation counts
when the portrait is accepted, even if the visitor later abandons email entry.
A catalog version change starts a fresh deck. Existing Workflow inputs without
reserved scenes retain the older deterministic pickers for replay.

## Validation limits

Automated checks use fake providers and a fake DynamoDB client. Live pod-role
permissions, cloud storage calls and the visual output of the new prompts need
verification after the hosted API/worker rollout. The test suite also exercises
the recorded scene selections against a real isolated Temporal server and replay.
