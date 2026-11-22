# Four-station booth controls

Use one persistent control hub on the laptop, reached through each station's same-origin gateway. Each browser has a saved station ID (1–4). The laptop's /config view manages global settings or any station. A station's Ziggy icon opens the same touch-friendly daily-date PIN interface.

Global demo switches and online/offline policy have explicit per-station overrides. A station's On overrides global Off; Inherit removes the override. Changes do not interrupt an active demo. New launches use the latest policy. Offline policy only permits locally supported demos in a local runtime, and never pretends to provision missing providers or switch worker connections.

Display settings are saved per station: width/height as viewport percentages, zoom as a percentage, horizontal/vertical offsets in CSS pixels. Direction buttons use 5/10/25/50 pixel steps. A bounded viewport keeps the content between the logo marquees and above navigation, clamps movement, and scrolls content without shrinking touch controls. Save applies across connected screens; Reset returns the saved geometry to defaults.

The hub stores revisions transactionally in SQLite and rejects stale writes. A small server-side component supplies a session cookie, PIN rate limiting, strict validation, and same-origin write checks. No provider keys enter browser configuration. Station polls report presence and cache last settings. If the hub disappears, the station retains settings and permits explicitly marked device-only fallback edits; reconnecting restores the saved hub settings. The hub is accessed on a private LAN via an opt-in listen address; default ports remain loopback-only.

Keep one Fieldkit YAML. Include the control component and route /control-api through the existing gateway. Local generation supports CONTROL_HUB_URL for station proxying and BOOTH_BIND_ADDRESS for deliberate LAN exposure. Do not provision infrastructure.

## Phases

1. Design and API contract (complete).
2. Implement persistent API and touch controls, integrate the launchpad/runtime and local runner (complete; Docker API/model/build checks passed).
3. Exercise authenticated writes, overrides, conflict/restart persistence, geometry and active-demo behavior in Docker/browser; document LAN setup and limitations.

The roadmap/Obsidian plugins are unavailable; this committed plan is the work tracker.
