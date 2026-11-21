# Deployment status and handoff

The deployment definition is deploy/reinvent-2026.yaml. It is one DemoProject with all application builds/components. It is not deployment-ready. No AWS, Cloud, catalog, or cluster resources have been provisioned by this migration.

## Confirmed platform blocker

Validated against Fieldkit main commit 69e7fa0f4faa3a08e25cb8462269ef215efe4544. The real validator rejects spec.aws when any component uses aws-lambda: the Lambda component would not receive the managed resource role. This affects the combined No Roads/Loan Lambda workers with Agent Harness/Photo Booth S3 and Bedrock declarations. It is independent of ingress routing. Keep the requirements together and resolve this with Michael; do not silently switch serverless demos to always-on workers or delete their AWS requirements.

Run scripts/validate-fieldkit.sh with access to the pinned platform checkout. scripts/validate.py checks repository structure and credential patterns only; a passing structural check is not deployment readiness.

## Other required gates

- Four-station routing and concurrent runs need verification. Separate namespaces are preferred, but Ian approved a shared namespace with station IDs and display filters as the fallback (STATION-ISOLATION.md). The current import has no station isolation or station filtering.
- Photo Booth currently keeps API and worker together in one pod so they can share files. It must remain one replica. The S3 bucket declaration alone does not make media durable; complete S3 media storage and restart/retention tests before collecting attendee photos. Local email/outbox/visitor files must not be published.
- Loan has no matching live demo YAML in the supplied platform snapshot. Its new Lambda image and injected queue/deployment settings require an actual serverless run and verified Bedrock model/permission alignment.
- Agentic SDLC remains disabled in the launchpad until the booth sandbox GitHub repository, scoped token, signed webhook, runtime secret, and provider account are configured. The manifest references a project-owned sandbox setting rather than the live SA storefront repository.
- Each build and every app's prefixed asset/API/stream route must pass. Only the tested builds and checks in VERIFICATION.md count.
- The proposed ingress host label is reinvent-booth. Michael must confirm the base domain/availability and hosted kiosk access mode. Initial ingress requires SSO. Anonymous operation on rental Macs needs an explicitly reviewed access arrangement; no personal login or secret export is installed by these scripts.
- publicUI remains false until workflow payload visibility and station-scoped reader access are approved.
- Secrets live under the new project's Secrets Manager scope. No SA live provider keys or credentials are copied. The platform provisions Cloud credentials; do not install AWS IAM keys on the browser-only stations.

## Embedded Temporal UI

Reference: [Michael’s public Tacos viewscreen example](https://dejavu-tacos.tmprl-demo.cloud/_reinvent_example/). The page and JavaScript were fetched without credentials on November 21, 2026. Its viewscreen renders a Temporal UI iframe with adjustable scale. Interactive workflow switching and browser framing behavior have not been verified here.

Michael confirmed that the live catalog can expose a self-hosted temporalio/ui pod backed by Temporal Cloud through a proxy sidecar with a separate read-only service account. Credentials stay inside the pods, so the booth can embed the UI without attendee Cloud logins. Fieldkit exposes this through temporal.publicUI, with per-namespace UI routes where supported.

Read-only access still exposes workflow payloads and histories. The combined project keeps publicUI false until attendee photo/email data is protected or placed outside the public demo namespace. The feature is available; safe publication of this project is not yet verified.

## Catalog workflow

Once the platform gate, app builds, and required settings are ready, use Add a Demo with the Temporal-owned public repository. Supply the existing single YAML to the onboarding flow and review its proposal, rather than authorizing replacement of the existing live catalog demos. Michael can wire the approved project to main for rebuild/redeploy. This repository contains no automatic kubectl apply, cloud apply, or live-platform commit step.

Deleting an onboarded project's YAML can tear down its resources. Treat removal as an infrastructure change, not ordinary source cleanup.
