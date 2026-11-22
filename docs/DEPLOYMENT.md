# Deployment status and handoff

The deployment definition is deploy/reinvent-2026.yaml. It is one DemoProject with all application builds/components. It is not deployment-ready. No AWS, Cloud, catalog, or cluster resources have been provisioned by this migration.

## Platform support for Lambda with spec.aws

Resolved in temporal-fieldkit-platform #151 (main 77037f86, November 21, 2026): spec.aws now accepts aws-lambda components. The project's Lambda exec role gets the bucket, table and model grants, usable only from inside the project's functions (lambda:SourceFunctionArn), and each selected function gets the resource and model env (not AWS_REGION, which Lambda sets). The manifest validates against that commit. Live needs the platform promotion that includes it.

Still to verify on the platform: one Lambda call to the loan Bedrock model (us.anthropic.claude-sonnet-4-5-20250929-v1:0) in live's account and region, us-west-1. Model access is per account and region, the operator does not check it, and a disabled model fails the loan agent at runtime while the demo shows Ready.

Run scripts/validate-fieldkit.sh with access to the pinned platform checkout. scripts/validate.py checks repository structure and credential patterns only; a passing structural check is not deployment readiness.

## Other required gates

- Four-station routing and concurrent runs need verification. Separate namespaces are preferred, but Ian approved a shared namespace with station IDs and display filters as the fallback (STATION-ISOLATION.md). The current import has no station isolation or station filtering.
- Photo Booth currently keeps API and worker together in one pod so they can share files. It must remain one replica. The S3 bucket declaration alone does not make media durable; complete S3 media storage and restart/retention tests before collecting attendee photos. Local email/outbox/visitor files must not be published.
- Loan has no matching live demo YAML in the supplied platform snapshot. Its new Lambda image and injected queue/deployment settings require an actual serverless run and verified Bedrock model/permission alignment.
- Agentic SDLC remains disabled in the launchpad until the booth sandbox GitHub repository, scoped token, signed webhook, runtime secret, and provider account are configured. The manifest references a project-owned sandbox setting rather than the live SA storefront repository.
- Each build and every app's prefixed asset/API/stream route must pass. Only the tested builds and checks in VERIFICATION.md count.
- Ingress (decided November 21, 2026): host reinvent-booth on live, `auth: public`, so attendees and the kiosks reach every demo without signing in. Only booth settings need a Fieldkit sign-in: `/config` and the control hub's writes (`/control-api`, `auth: required`). Kiosks poll `/control-api/state`, a public route. Every paid or outbound action (image generation, SDLC runs, Photo Booth email) is reachable by anyone who finds the host; provider spend caps are the limit, and the project is removed after re:Invent.
- publicUI is on (decided November 21, 2026). Every workflow history in the namespace is readable by anyone at `/_temporal/primary/`, and the hosted launchpad embeds that route (`apps/launchpad/public/runtime-config.json`). Photo Booth and Flight Simulator, which take attendee emails, keep every payload (inputs, results, activity data, query answers) in the `payloads` S3 bucket through Temporal's external storage (`holodeck/temporal_client.py`: the SDK's `S3StorageDriver`, threshold 0), so their histories show only storage references; the UI's reader cannot read the bucket. Their event types, activity names, timings, retries and failure messages stay visible. Other demos' payloads are public; anything an attendee types into Travel Agent or Agentic SDLC is readable there.
- Buckets keep objects 30 days (`expirationDays`), past the namespace's 7-day retention, so stored payloads and photos can be retrieved after their workflows expire. The project and its buckets are deleted after re:Invent.
- Secrets live under the new project's Secrets Manager scope. No SA live provider keys or credentials are copied. The platform provisions Cloud credentials; do not install AWS IAM keys on the browser-only stations.

## Embedded Temporal UI

Reference: [Michael’s public Tacos viewscreen example](https://dejavu-tacos.tmprl-demo.cloud/_reinvent_example/). The page and JavaScript were fetched without credentials on November 21, 2026. Its viewscreen renders a Temporal UI iframe with adjustable scale. Interactive workflow switching and browser framing behavior have not been verified here.

Michael confirmed that the live catalog can expose a self-hosted temporalio/ui pod backed by Temporal Cloud through a proxy sidecar with a separate read-only service account. Credentials stay inside the pods, so the booth can embed the UI without attendee Cloud logins. Fieldkit exposes this through temporal.publicUI, with per-namespace UI routes where supported.

Read-only access still exposes workflow payloads and histories. publicUI is on for this project (see "Other required gates"): Photo Booth and Flight Simulator payloads are in S3, and everything else an attendee types into a workflow is public.

## Catalog workflow

Once the platform gate, app builds, and required settings are ready, use Add a Demo with the Temporal-owned public repository. Supply the existing single YAML to the onboarding flow and review its proposal, rather than authorizing replacement of the existing live catalog demos. Michael can wire the approved project to main for rebuild/redeploy. This repository contains no automatic kubectl apply, cloud apply, or live-platform commit step.

Deleting an onboarded project's YAML can tear down its resources. Treat removal as an infrastructure change, not ordinary source cleanup.
