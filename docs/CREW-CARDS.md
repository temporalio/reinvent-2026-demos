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
four-card cycle. The asteroid is clipped to its card. A dark scrim sits above both
art layers and below all text and controls; artwork cannot capture pointer input.
