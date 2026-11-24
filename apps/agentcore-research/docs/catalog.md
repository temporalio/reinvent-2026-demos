# Catalog readiness

The decisions guide 12 asks every demo to write down. The draft resource is
[`deploy/demoproject.yaml`](../deploy/demoproject.yaml); guide 20 covers onboarding.

**The platform refuses the draft today.** It grants the agent a Bedrock model through `spec.aws`
with `aws.components: [agent]`, and the platform refuses `spec.aws` for an `aws-agentcore`
component until tdo-8lak.15 lands (`InvalidSpec`, "cannot get spec.aws resources yet"). The
platform's `validate-projects` reports that one problem and nothing else. Without the grant the
agent's runtime role can't call Bedrock, so wait for tdo-8lak.15 rather than deploying with
`AGENT_MODEL=stub`.

1. **Session boundary and identity source.** A browser session: the API sets an `oncall_session`
   cookie (32 random hex characters, HttpOnly, SameSite=Lax, Secure behind HTTPS) on the first
   request. The platform's sign-in (`X-Temporal-Auth-Email`) only labels who approved; it scopes
   nothing.
2. **What the session identity scopes.** Every Workflow ID: `<task queue>-<session>-<incident>`.
   The API builds IDs from the cookie, so one browser can't read, approve or reject another's
   incident; Temporal answers not found. The Worker status is shared: every viewer sees the same
   Worker, which is the point of the demo.
3. **Task-queue environment variable, base queue, and how Workflow code inherits the queue.**
   `TEMPORAL_TASK_QUEUE`, base `agentcore-oncall`, set as a literal on both components. The
   Workflow starts no child Workflows and uses no other queue.
4. **How Workflow IDs and external records stay distinct across crashable workspaces that share a
   Namespace.** There are no crashable workspaces: the platform never makes a project with a
   serverless component crashable, and the draft says `crashable.enabled: false`. Concurrent
   presenters are kept apart by session-scoped Workflow IDs (2). There are no external records.
5. **Build and component mapping.** Build `api` (`api/Dockerfile`, last stage `api`) runs the
   Kubernetes component `api`. Build `agent` (`agent/Dockerfile`, last stage `runtime`) runs the
   serverless component `agent` (`aws-agentcore`, built for linux/arm64 by the platform,
   `idleSessionTimeoutSeconds: 60`). The Build ID is unset, so each commit is a new Worker
   Deployment Version and pinned incidents finish on the version they started on.
6. **Public and internal routes.** One route, `/` to `api:http`, behind the platform sign-in. The
   agent has no route: Temporal Cloud invokes its AgentCore endpoint.
7. **Temporal configuration and credential flow.** API key auth (`temporal.auth.mode: apiKey`).
   The API gets `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY` and `TEMPORAL_TLS`
   from `temporalAccess`; the agent gets the same through the platform's cold-start wrapper, plus
   `TEMPORAL_DEPLOYMENT_NAME` and `TEMPORAL_WORKER_BUILD_ID`. Both read them with the SDK's
   envconfig, config file disabled. `temporal.searchAttributes` creates `OncallPhase` (Keyword).
8. **Required secrets and external state.** No secrets of its own. Bedrock access is the runtime
   role's, from `spec.aws.bedrock.models.agent` (`us.anthropic.claude-sonnet-5-5` in
   `BEDROCK_MODEL_ID`); model access must be enabled once per AWS account. No databases, no
   buckets.
9. **The smoke-check endpoint.** `GET /healthz`: 200 when the API is up and Temporal answers
   `CheckHealth`. It changes nothing and wakes no Worker.
10. **Known mismatches with the current registry contract.**
    - `spec.aws` on an `aws-agentcore` component (tdo-8lak.15), above.
    - `Strands Agents` is not among the catalog's `aiSdks` examples; the draft adds it.
    - `AGENTCORE_DEBOUNCE_SECONDS` is 30 in the draft (Temporal's sample uses 60), so the Worker
      drains within a minute of the proposal; the 60 s idle session timeout then ends the session.
