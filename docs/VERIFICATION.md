# Verification status

Initial migration checks, November 21, 2026. This is a reviewable source migration, not a deployed booth release.

## Initial checks (superseded by the later checks below)

- Repository structure and credential-pattern scan: nine demos, 17 builds, one YAML document containing one DemoProject. Pattern scanning is not exhaustive secret detection.
- Three Python unit tests covering the manifest, same-origin demo catalog, local logo assets, and opposite marquee directions.
- Docker builds for launchpad, gateway, Tacos frontend, and Photo Booth.
- Gateway routing fixture covering all nine demo prefixes, forwarded prefixes, and query preservation. This did not exercise the nine real demo backends.

## Initial limitations (see later verification below)

The real Fieldkit validator at commit 69e7fa0f4faa3a08e25cb8462269ef215efe4544 rejects the combined AWS/Lambda requirements:

```text
spec.aws: is not supported for projects with aws-lambda components (component "loan-worker" would not get the role)
```

Remaining builds, actual Cloud workflows, Lambda invocation, provider integration, station routing/filtering, Temporal UI embedding, durable Photo Booth media, browser interaction, and physical TV/multitouch behavior are not verified by these checks. No infrastructure was applied. See DEPLOYMENT.md for release gates.

## First local preview and shared portrait stage

Verified November 21, 2026 on the local Compose runner:

- Eight repository/local-runner tests and the credential-pattern scan passed.
- Docker builds and startup succeeded for launchpad, gateway, Tacos, Banking, Pipeline, Flight Simulator, and Photo Booth. API/worker images now install their workspace packages at build time rather than fetching them at startup.
- Completed synthetic Tacos, Pipeline, Flight, and mock Photo Booth workflows were confirmed through Temporal CLI descriptions. Banking completed a synthetic $50 transfer through the browser and appeared as Completed in the embedded Temporal UI.
- Moto S3 put/get/delete passed against the emulated photos bucket.
- At 1080×1920, the browser displayed Banking's customer/backstage split and the shared lower tabs, and Tacos's native three panels. Mech selected code by default. Local Temporal UI rendered in its lower iframe.
- A message from the actual application iframe could focus the shared Temporal tab; the same message from the parent page was ignored.
- Five local route pages and the Temporal UI returned HTTP 200. Photo Booth's landing page rendered. This is not full gameplay, camera, stylus, or physical-TV verification.

The presentation shell and booth-only theme adapter cover all nine entries. The four provider/serverless/GitHub-dependent demos have not been exercised in this local runner and remain disabled locally. Most apps still use a combined upper application area; detailed per-demo two-panel adapters and visual review remain work. Translated SDK samples, live architecture telemetry, fleet/PIN controls, touch keyboard, and general panel pinch handling are not complete. No hosted infrastructure was changed.

## Remaining local adapters and native panels

Verified November 21, 2026:

- All nine local presentation routes build/start. No Roads completed a real Workflow through its versioned native worker. It reports native execution rather than Lambda.
- Loan profiles/forms load; all five inference/decision mutation routes return immediate provider-unavailable responses, including behind the /loans prefix. Agent Harness and SDLC read endpoints load; mutating model/GitHub actions return 503 before external work.
- At 1080×1920, Loan, No Roads, Travel, SDLC, and Pipeline native documents have scrollWidth equal to innerWidth. Seven demos now use paired upper areas; Flight/Photo use combined upper areas.
- Harness Svelte validation and SDLC TypeScript builds passed. The Pipeline completed a browser-started local Workflow and preserved its booth theme through processing and confirmation navigation.
- Banking's native home link returns to the parent mission list instead of nesting another launchpad. Native local Lambda metrics are marked Not emulated.
- Loan's actual Bedrock factories and four agent constructors were tested with networking disabled. Model IDs are resolved by the worker plugin from BEDROCK_MODEL_ID, with optional isolated per-agent overrides. No inference was invoked. Native and Lambda workers share that configuration; the Lambda image now exports dependencies from the same lockfile.

The single hosted YAML still fails the Fieldkit AWS/Lambda validator. Loan's worker is now explicitly selected for its declared Bedrock resource, but the platform must support that role/env combination before hosted validation can pass. Catalog onboarding has not started. Dependency updates and broader compatibility CI are reviewed in a separate PR.

The combined portrait/dependency candidate was also built and exercised locally: all nine routes passed, the three provider-limited mutation guards returned 503, and all six synthetic Workflows completed. This includes the updated FastAPI/Starlette/AnyIO stack, native Go gRPC worker, and Pillow 13 image generation. The candidate is assembled from two independent review branches; this is not a claim that main or the hosted catalog already contains them.

The platform was rechecked at main b3347fe on November 21. Its AWS/Lambda validation remains unchanged from the pinned commit. No hosted provisioning was attempted.

## Four-station control hub

Verified November 21, 2026 with the combined portrait/dependency candidate:

- The control image passes 26 real HTTP tests without external networking: the 11 HTTP tests (PIN expiry/date boundaries, same-origin writes, validation, simultaneous-save conflicts, restart persistence) against both the SQLite store and the DynamoDB store (an in-memory fake that enforces the conditional writes), plus 4 DynamoDB-only tests (session TTL attribute, storage errors as 503, a second start keeping saved settings, an unreachable table at start). Resource warnings also fail the test run. Not exercised against real DynamoDB.
- The launchpad passes 13 policy/store regression checks and builds with TypeScript. These include query-based station identity across navigation, offline Inherit, cached authentication, a fresh backup hub with a lower revision, and stale poll/logout races. Eighteen root/generator tests and the structure/credential-pattern scan pass.
- Four isolated browser sessions used four gateway origins connected to the same hub. Global Tacos Off disabled launches on stations 1, 3, and 4; station 2 On overrode it. The already-running station 1 iframe survived the policy update, and its card became disabled after returning to missions.
- The laptop UI saved a 50-pixel right move. Station 2 measured width 80%, height 70%, x 75px, y 50px, and content zoom 90%, while its existing iframe marker remained intact. Ziggy overlay open/close also retained that iframe.
- Desktop, 1080×1920, and 2160×3840 browser checks had no horizontal overflow. Portrait demo geometry stayed inside the frame; visible control buttons measured at least 44 CSS pixels high. Unsaved drafts survived repeated polling.
- Replacing the actual control container preserved saved settings in its named volume. Stopping the hub left the station running with cached settings. Its PIN-gated device-only width change applied locally; restarting the hub restored its saved width, removed the fallback, and relocked recovery controls without losing the iframe.
- Two-hop gateway fixtures preserve URI/query, Host/Origin, scheme, and session cookies. HTTPS fixtures reject untrusted certificates and accept the trusted certificate/SNI path.
- All nine application routes and the local Temporal UI still pass route checks. The temporary station gateway fixtures were removed, and their synthetic configuration changes were reset.

These are local browser/container checks, not tests on four physical Mac Minis or booth televisions. Online/offline controls govern new launch availability; they do not switch worker connections, disconnect hardware networking, or provision providers. Full demo touch keyboards, arbitrary panel pinch handling, fleet process restart/forced-demo commands, and automatic hub/database failover remain separate work. Hosted control data needs durable storage support before its configuration writes can be relied on across pod replacement.

## Holodeck external payload storage

Verified November 21, 2026:

- Photo Booth and Flight Simulator backends: 20 tests each pass (`uv run --frozen --extra aws --group dev python -m pytest`), including 4 new ones: a payload carrying an email encodes to an `ExternalStorageReference` with no email bytes and decodes back; a missing object reads as absent; no `PAYLOAD_BUCKET` leaves payloads inline; with one, the threshold is 0.
- Both images build in Docker with temporalio 1.36.1 and boto3 1.43.101.
- Not exercised against real S3 or a real workflow run; first hosted run should confirm a Photo Booth history in the public UI shows references only.

## Touchscreen panel cleanup

Verified November 22, 2026 against the local candidate built from the deployed onboarding branch:

- Launchpad Docker build and 23 tests pass. Banking Docker build/typecheck/ESLint and Tacos Docker build/lint/six behavioral tests pass. Twenty-one root checks include the 72-example coverage/provenance checks; native excerpts match the source and translations are explicitly illustrative, not compiled SDK programs.
- All nine local demo pages passed measured equal upper/lower tracks, no outer or native document scrolling, no clipped upper controls, and fitting Business/Architecture tabs at 1080×1920 and 2160×3840. Each SDK selector switched among eight distinct 12–32-line examples. Code/Temporal remain their own lower content regions; Temporal UI internals were not restyled.
- Saved zoom 75/100/125% and height 60/78/90% kept equal tracks and zero station/document overflow. Banking compact account/form/review screens were exercised; its synthetic $50 transfer completed in Temporal. A native workflow link, with its old local-preview port normalized only in the browser fixture, selected the lower Temporal tab without a new tab; passive updates preserved the selected tab.
- Tacos menu, populated cart, checkout, and relocated Kitchen settings dialog were opened without scrolling. Its dialog measured 321px within a 641px iframe. No Tacos order was submitted in this layout check. Native zoom/Perspective/language dropdown/footer duplicates are absent from the embedded shared view.
- Real wall-clock testing with normal hub polling showed the five-second countdown after 30 seconds. A real pointer click reset the timer beyond its old deadline; after a fresh 35-second idle period the visitor screen returned to the screensaver. Photo and staff controls remained open. Unit tests also cover Flight exemption, iframe input, and detached-frame cleanup.
- Both embedded and standalone planet Launch returned to crew selection, removed stale demo state, and preserved station identity. Mech selection opened Tacos on Workflow code. The gradient layer measured left 0/full viewport width on both portrait and letterboxed landscape views.
- Staff draft preview rendered width 89% while the hub remained at 90% with the same revision. Back retained the unsaved/unlocked draft. Only Save changed the hub revision/width; the isolated preview was then reset to centered defaults.

No live deployment, GitHub sandbox creation, provider inference, or physical television/stylus acceptance was performed. The exact character portraits are still missing from the latest toolkit tree; see TOUCHSCREEN-UI.md. The PIN-only ingress fix is reviewed separately in PR #8.
