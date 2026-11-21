# Launchpad

The entry screen for the booth. An LCARS-inspired "where would you like to go
today?" touchscreen that sends visitors to an area of the ship.

Built (React + Vite + the shared ship-ui), dev port **5100**. Requirements
live in the project `docs/` repo (`theme-and-interaction.md`,
`stations-and-deployment.md`, `admin-panel.md`).

## Running the whole ship

From the project root:

```bash
./start.sh              # everything on this laptop: Temporal, every demo, this Launchpad, Booth Control
./start.sh --help       # every option and command, plus the common cases
```

`./start.sh --help` is the reference for the flags and commands (station and
hub setup, offline, one demo, restarts, stop, logs); it's kept in step with
the parsing in `ship.sh`, so it isn't repeated here.

The root `start.sh` just calls `launchpad/ship.sh` (so the launcher is
version-controlled here). It:

- starts the shared Temporal dev server on 7233 if none is running (history
  kept in `.ship/temporal.db`),
- checks the OpenAI key once; if it's missing or rejected, AI demos start in
  **offline mock mode** (override with `--online`),
- starts each demo with its own `start.sh`, logging to `.ship/logs/<id>.log`,
  and leaves alone any demo that's already running,
- waits for every web port, prints the URLs, opens the Launchpad, and on
  Ctrl-C stops everything it started (and nothing else).

It also:

- starts this station's Booth Control agent;
- on the hub machine, starts Booth Control itself;
- skips demos switched off for this station, and opens the Launchpad with
  `?station=&hub=`.

See [booth-control/README.md](../booth-control/README.md).

The demo list lives in `ship.sh` (processes) and `src/decks.json` (what the
Launchpad shows; `src/ship.ts` types it). Add new demos to both.

## Development

```bash
npm install && npm run dev     # http://localhost:5100
```

Demo links use the Launchpad's own hostname, so it also works when the
Launchpad is opened from another machine on the booth network. `?station=<id>`
and `?hub=<Booth Control URL>` are passed through to every demo.

**Booth config:** the Launchpad reads the Booth Control settings
(`useBoothConfig()`):

- each deck page's idle timeout (0 = never; the Holodeck deck never times
  out, on any station, whatever the config says);
- the station's home deck: station 4 starts on the Holodeck, and idle
  returns there;
- the screensaver idle time and variant;
- offline mode (greys out cards with `online: true`);
- demos switched off for this station (hidden; a deck with nothing left shows
  "Under repair").

Broadcast commands work too: home, reload, screensaver. The Holodeck gets `?launchpad=` so its back
button returns here.

## Layout: the launch shaft

A launch shaft runs down the middle of the screen. The decks
branch off it, alternating right and left as you go down the ship:

```
                      │
                      ├──────────  THE BRIDGE
                      │            executives
  ENGINEERING ────────┤
   developers         │
                      ├──────────  OBSERVATION ARBORETUM
                      │            marketing & creatives
    SICK BAY  ────────┤
  devops/secops       │
                      ├──────────  HOLODECK
                      │            games & fun
                      │
                                              [ Ziggy: staff panel, top right ]
```

Top to bottom:

1. **The Bridge**: upper right
2. **Engineering**: a little lower, left
3. **Observation Arboretum**: under the Bridge, right
4. **Sick Bay**: under Engineering, left
5. **Holodeck**: under the Observation Arboretum, right

Tapping a deck slides the launch car along the shaft to it, then shows that
deck's page: its header (who it's for, what's there) and a grid of demo cards,
each with a screenshot of the demo in action, a Ready/Not running light, and
a Launch button.

Nothing ever scrolls. Deck rows size their text from their own height
(container query units), and the demo grid fills the space under the header:
2 columns in landscape (2×2, 3×2 for five or more demos), 1 column in portrait
for up to three demos, 2 columns beyond that.

On a portrait display the shaft gets taller and the decks spread out along it.
On a wide landscape display the branches get longer and the cards sit beside
them.

## Destination cards

Each destination shows a short card: **who it's for** and **what kinds of demos
are there**, so visitors (or booth staff steering them) can pick the right deck.
Draft card copy:

| Destination | Who it's for | What you'll find |
|---|---|---|
| **The Bridge** | Executives, managers, decision makers | What Temporal does for your business. Take a service offline and watch the process wait and recover instead of failing. No code. |
| **Engineering** | Developers, architects, hands-on engineers | Payments, AI agents, data pipelines, communication APIs, and more, with the live code in your choice of SDK language and the running line highlighted. |
| **Sick Bay** | DevOps, SRE, platform, and security teams | Crash a system and heal it. Rebuild the architecture and watch Temporal replay history and pick up exactly where it stopped. |
| **Observation Arboretum** | Marketing, content, creative, and growth teams | The big picture for the systems your campaigns and content depend on: journeys, AI content pipelines, launches that don't drop the ball. |
| **Holodeck** | Everyone | Games and fun AI-generated experiences. |

Copy will change as demos are chosen. Keep each card short enough to read in
a few seconds from a few feet away.

In offline mode, demos that need the network are hidden or marked unavailable
(see `admin-panel.md`). A deck with nothing available shows as "under repair"
rather than disappearing, so the layout stays the same.

## Screensaver (attract mode)

A full-screen animated attract loop: "What if your ____ never crashed?" with
Ziggy (the Temporal tardigrade, in a spacesuit and bubble helmet) running the
show. Code in `src/screensaver/`.

**Two variants** (they share Ziggy, the copy and the Learn more / Done loop):

- **slots** (default; it's Vegas): Ziggy flies to the slot machine's lever,
  pulls it (anticipation, yank, bounce), the reel lands on a phrase, the
  lights flash and Temporal-logo coins spill out of the tray.
- **classic**: the same headline as a giant word reel while Ziggy loops around.

Then Ziggy taps **Learn more**, a card explains how Temporal helps with that
item (8 s countdown), Ziggy taps **Done**, and it goes round again. Items are
shuffled with no repeats until all have shown. Every 2 rounds a short scene
plays: "What Temporal does" (a workflow survives a crash and replays), "How
Temporal helps AI agents" (429, retry, worker crash, resume), and "Temporal +
Amazon Bedrock AgentCore".

**Starting it**

- The **✦ Screensaver** button in the Launchpad home top bar (alternates
  slots / classic on each press).
- Automatically after the booth's `launchpad_home_idle_s` (default **5
  minutes**) with no touches on the Launchpad home (not on a deck page).
  - A deck page returns home after its deck's idle timeout (default 90 s;
    "never" possible; the Holodeck deck always never).
  - Both are set in the admin panel.
- Any tap, click or key exits back to the Launchpad home.

| URL param | Effect |
|---|---|
| `?screensaver=1` / `=slots` / `=classic` | Start immediately (1 = slots). Good for a dedicated screen. |
| `?screensaver_idle=10` | Idle seconds before it starts (testing). |
| `?screensaver_cycles=1` | Reel rounds between scenes (default 2). |
| `?screensaver_scene=durable\|agents\|agentcore` | Play that scene first (testing). |
| `?motion=reduce` | Force reduced motion (also follows the OS `prefers-reduced-motion`): fades instead of flight paths, no coins or drifting stars. |

**Editing**

- All copy (reel items, the Learn more text, scene captions) is in
  `src/screensaver/content.ts`, written for marketing to edit.
- **Ziggy** is one self-drawn SVG component, `src/screensaver/Ziggy.tsx`. To use
  official mascot art, replace only that file. Keep the exported viewBox size
  and hand positions (`ZIGGY_HAND`, `ZIGGY_FIST`), which the flight code uses to
  put Ziggy's finger on buttons and his fist on the lever, and keep the group
  class names (`zg-bob`, `zg-ant-l/r`, `zg-eyes`, `zg-arm-front`,
  `zg-arm-back`, `zg-flame`) if you want the antenna wiggle, blinking, tapping
  and thruster flicker. A flat PNG also works; Ziggy then flies and tilts as a
  whole.
- The coin and marquee logo is the official Temporal mark,
  `public/brand/temporal-mark.svg` (copied from the Holodeck assets).

Everything animates `transform`/`opacity` (Web Animations API, CSS and one
`requestAnimationFrame` loop for Ziggy and the coins), with no video files or
animation libraries, so it stays smooth at 4K. Text scales with ship-ui's
`--ship-type`.

## Planned behavior

- Attract/idle screen that invites visitors to touch (done: see Screensaver).
- Works on touchscreens in landscape and portrait, and on booth staff laptops.
- Every demo has a way back here, and idle timeouts return here (or to the
  station's home deck).
- The Ziggy button at the top right opens the staff admin panel (staff PIN).

## Demo screenshots

`public/shots/<demo id>.jpg`, one per demo card (ids in `src/ship.ts`), shown
on each deck's page. Each is a 1920×1080 capture of the demo **in action**
(mid-retry, mid-game, a finished result), with no on-screen keyboard visible,
resized to 1280 wide JPEG. Refresh them whenever a demo's UI changes: drive
the demo to a good moment in a browser at 1920×1080, screenshot, then
`sips -Z 1280 -s format jpeg -s formatOptions 78 shot.png --out public/shots/<id>.jpg`.
A card with no screenshot shows the demo's name instead.
