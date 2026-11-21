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
