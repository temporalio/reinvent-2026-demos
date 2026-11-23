# Crew cards and mission artwork

The character PNGs in `apps/launchpad/public/assets/crew/` and mission artwork in
`apps/launchpad/public/assets/missions/` were supplied by Ian on November 22, 2026.
They preserve the provided images, including transparency. They are separate from
the toolkit assets; the toolkit does not currently include these exports.

Crew cards use Ash's Cosmic Pop persona colors. Their five-point meters describe
the emphasis of a tour, not app capabilities or restrictions:

| Crew | Code | Business impact | AI exploration | Failure testing | Default tab |
| --- | --- | --- | --- | --- | --- |
| Captain | 1 | 5 | 2 | 2 | Business impact |
| Mech | 5 | 3 | 3 | 4 | Workflow code |
| Envoy | 3 | 3 | 2 | 5 | Architecture |
| Solarian | 1 | 5 | 3 | 1 | Business impact |
| Space Wizard | 4 | 4 | 5 | 3 | AWS/AI mission filter |

All four personas retain access to every information tab. Space Wizard filters
missions; it does not select a fifth persona. Holodeck lists the flight simulator
and Photo Booth. Existing availability rules still apply.

Mission cards vary the starfield crop and asteroid rotation/edge placement in a
three-card cycle. The asteroid is clipped to its card. Dark backing and text shadows protect the content while leaving the edge artwork
visible. Launch buttons use a dark translucent fill; artwork cannot capture pointer input.

The shared frame now reads from the authenticated Figma file
`fbSWlm7bLNikbn6ezCAHNn`, Mission frame `213:54169`. Crew frame `212:47589`
and Demo frame `213:56656` share its background geometry. Original raster hashes
confirm the starfield (`937bfdda35174237408796b93f8c051156bb1b8a`), grid
(`d7fa2f9950cd705abaa42d5c739265cb6be0ea81`), and moon
(`783c6e83b8e76a4ae7433bbfee8956ec9b39f198`).

The glow export retains its blur/noise. The pink ellipse is the actual SVG from
node `213:54591`, with its root dimensions unchanged. CSS normalizes the measured
positions and transforms from the 1080 × 1920 design frame. The astronaut Ziggy
uses Ian's supplied export. The earlier supplied exports remain in the repository.
All frame layers ignore touch; the saved station rectangle and Temporal UI are
unchanged. Effective browser geometry and physical-screen rendering still need
Island verification.
