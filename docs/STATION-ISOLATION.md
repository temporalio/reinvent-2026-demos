# Four-station isolation plan

Station isolation is optional. Ian approved a shared namespace if Fieldkit cannot separate every demo. This document describes the preferred isolation path, not an implemented claim.

Use mac1, mac2, mac3, and mac4 as four Fieldkit named-namespace labels inside the single DemoProject. Fieldkit derives their actual Cloud names from the project; do not guess or manually create duplicate names. Give every station's APIs and workers credentials scoped to its own namespace and queues. Four replicas behind one shared credential do not provide that isolation.

The initial manifest still has one set of app components. Before deployment, expand the station-aware components/bindings and agree their routing with Michael. Keep shared static builds and the launchpad/gateway shared where safe. The current platform supports named namespaces, but custom search attributes are primary-only; Banking/Pipeline Step and SDLC AgenticSdlcGitHubRefs need an explicit solution for each station namespace.

The UI should be self-hosted Temporal UI connected to Cloud, not a second local Temporal server. Prefer the same core HTTPS origin. Provision a separate namespace-scoped read-only identity for each UI backend; keep keys out of browsers. A UI filter or editable station query/cookie is not an authorization boundary.

Fieldkit's publicUI feature exposes workflow histories to anyone who can reach its route. It is on for the shared namespace by decision on November 21, 2026 (DEPLOYMENT.md). Photo Booth and Flight Simulator keep their payloads, attendee emails included, in S3 external storage, so the UI shows references for them. Do not proxy the Cloud account management website or remove framing protections from GitHub.

## Approved shared-namespace fallback

Use the primary namespace for all four stations if named namespaces block Lambda or versioned workers. Attach a station ID to workflow IDs and supported search attributes, and filter each station display to its own runs. Filters are presentation only; they do not restrict access to other stations. Backend credentials stay out of the browser. Verify station routing and concurrent runs before booth use.

## Acceptance for namespace isolation

- Run simultaneous workflows from four independent browser contexts and cameras where available.
- Verify each station's backend/worker/UI use its assigned namespace.
- From Mac 1, attempt Mac 2's namespace/history URL and API identifiers; require denial, not a hidden menu item.
- Confirm read-only UI credentials cannot start, signal, terminate, or alter workflows.
- Inspect browser traffic and bundles for Cloud/provider keys; none may be present.
- Verify a camera failure disables Photo Booth on only the affected station without interrupting another station's current demo.
