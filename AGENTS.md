# re:Invent 2026 demos

One monorepo, one Fieldkit DemoProject, one core host. Each app has source under apps/.

- Preserve 2026-old; do not edit that archive.
- Keep provider credentials, attendee photos, runtime state, and dependencies out of Git.
- CODEOWNERS is @iandouglas. Do not add co-author trailers or AI attribution.
- Use Ash's Cosmic Pop tokens and customer logo assets. Respect reduced motion.
- The top screensaver logo row moves right to left; the bottom moves left to right.
- Apps are reached through the core host's URI paths, never localhost ports in production.
- Do not restyle the Temporal UI.
- Build and exercise demo processes in Docker. Planning and validation tools may run locally.
- deploy/reinvent-2026.yaml is the single deployment definition. Do not split apps into separate DemoProjects.
- Validate against the pinned Fieldkit operator. Report unsupported combinations; never silently remove Lambda, S3, or model requirements to get a green check.
- Do not apply manifests, modify a live cluster, or provision AWS without a reviewed target and explicit deployment authorization.
