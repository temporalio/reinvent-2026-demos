# Verification status

Initial migration checks, November 21, 2026. This is a reviewable source migration, not a deployed booth release.

## Passed locally

- Repository structure and credential-pattern scan: nine demos, 17 builds, one YAML document containing one DemoProject. Pattern scanning is not exhaustive secret detection.
- Three Python unit tests covering the manifest, same-origin demo catalog, local logo assets, and opposite marquee directions.
- Docker builds for launchpad, gateway, Tacos frontend, and Photo Booth.
- Gateway routing fixture covering all nine demo prefixes, forwarded prefixes, and query preservation. This did not exercise the nine real demo backends.

## Blocked or unverified

The real Fieldkit validator at commit 69e7fa0f4faa3a08e25cb8462269ef215efe4544 rejects the combined AWS/Lambda requirements:

```text
spec.aws: is not supported for projects with aws-lambda components (component "loan-worker" would not get the role)
```

Remaining builds, actual Cloud workflows, Lambda invocation, provider integration, station routing/filtering, Temporal UI embedding, durable Photo Booth media, browser interaction, and physical TV/multitouch behavior are not verified by these checks. No infrastructure was applied. See DEPLOYMENT.md for release gates.

## Local preview and shared portrait stage

Verified November 21, 2026 on the local Compose runner:

- Eight repository/local-runner tests and the credential-pattern scan passed.
- Docker builds and startup succeeded for launchpad, gateway, Tacos, Banking, Pipeline, Flight Simulator, and Photo Booth. API/worker images now install their workspace packages at build time rather than fetching them at startup.
- Completed synthetic Tacos, Pipeline, Flight, and mock Photo Booth workflows were confirmed through Temporal CLI descriptions. Banking completed a synthetic $50 transfer through the browser and appeared as Completed in the embedded Temporal UI.
- Moto S3 put/get/delete passed against the emulated photos bucket.
- At 1080×1920, the browser displayed Banking's customer/backstage split and the shared lower tabs, and Tacos's native three panels. Mech selected code by default. Local Temporal UI rendered in its lower iframe.
- A message from the actual application iframe could focus the shared Temporal tab; the same message from the parent page was ignored.
- Five local route pages and the Temporal UI returned HTTP 200. Photo Booth's landing page rendered. This is not full gameplay, camera, stylus, or physical-TV verification.

The presentation shell and booth-only theme adapter cover all nine entries. The four provider/serverless/GitHub-dependent demos have not been exercised in this local runner and remain disabled locally. Most apps still use a combined upper application area; detailed per-demo two-panel adapters and visual review remain work. Translated SDK samples, live architecture telemetry, fleet/PIN controls, touch keyboard, and general panel pinch handling are not complete. No hosted infrastructure was changed.
