# Fit the touchscreen demo viewport

The configured station rectangle is the size budget. Demo screens must not scroll at the station surface, stage, or application-iframe wrapper. Use flex/grid percentage tracks with min-height:0; remove browser-viewport and fixed minimum stage heights. Keep app controls and lower tabs on screen together. Code scrolls in its code region; Temporal scrolls inside its own iframe, with no extra enclosing scroll area.

Move Screensaver beside Ziggy, remove the station policy status and demo Sector03 eyebrow, and remove the per-demo zoom selector. Saved station geometry/zoom remains the operator control.

Compact the native customer/control views, beginning with Banking. Avoid simply hiding overflow over unreachable controls. Workflow links are intercepted only from the owned same-origin child frame and select/focus the lower Temporal tab. New-tab navigation is not used in the kiosk view.

Code examples contain the key orchestration idea, not a whole source file. Provide a labeled language icon selector and per-demo short examples. Clearly distinguish the running implementation from illustrative equivalents. The user requested nine languages; official docs currently list eight plus community Swift. Clarification is pending while layout work proceeds.

Phases: (1) inspect/document complete; (2) shared shell, native adapters, and curated examples; (3) Docker builds, browser geometry/flows and owned-frame navigation checks; commit and PR against the deployed onboarding branch. No deployment or merge.
