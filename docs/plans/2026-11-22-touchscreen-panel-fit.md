# Fit the touchscreen demo viewport

The configured station rectangle is the size budget. Demo screens must not scroll at the station surface, stage, or application-iframe wrapper. Split the demo stage into exactly 50% upper application and 50% lower information tracks. Use flex/grid percentage tracks with min-height:0; remove browser-viewport and fixed minimum stage heights. Keep app controls and lower tabs on screen together. Code scrolls in its code region; Temporal scrolls inside its own iframe, with no extra enclosing scroll area.

Move Screensaver beside Ziggy, remove the station policy status and demo Sector03 eyebrow, and remove the per-demo zoom selector. Saved station geometry/zoom remains the operator control.

Compact the native customer/control views, beginning with Banking. Avoid simply hiding overflow over unreachable controls. Workflow links are intercepted only from the owned same-origin child frame and select/focus the lower Temporal tab. New-tab navigation is not used in the kiosk view.

Code examples contain the key orchestration idea, not a whole source file. Provide a labeled language icon selector and per-demo short examples. Clearly distinguish the running implementation from illustrative equivalents. The user confirmed the eight official SDK languages only; do not include community Swift.

Phases: (1) inspect/document complete; (2) shared shell, native adapters, and curated examples; (3) Docker builds, browser geometry/flows and owned-frame navigation checks; commit and PR against the deployed onboarding branch. No deployment or merge.

Screensaver follow-up: all exit/Launch paths return to crew selection before a demo can start. The latest toolkit tree at da8ce54 contains no Captain/Mech/Envoy/Solarian/Space Wizard portrait exports; character artwork remains pending source assets. Do not present substitute art as Ash's characters.

Completed follow-ups: mission capability cards; 30-second idle plus 5-second countdown with staff/active Holodeck exemptions; full-bleed gradient; in-memory Tacos position preview that preserves the unlocked draft. All native/SDK/browser checks are recorded in docs/TOUCHSCREEN-UI.md and docs/VERIFICATION.md. SDLC account/repository setup is documented separately, with no remote resources created.
