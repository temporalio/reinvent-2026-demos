# Remaining Agentic SDLC activation steps

November 27, 2026. These are the remaining steps for the shared hosted backend.
No GitHub token, AWS credentials, provider keys or GitHub login belongs on the four
booth machines. Staff use GitHub from a trusted laptop or phone.

## 1. Verify or install the existing sandbox token in Fieldkit

A Fieldkit administrator must verify or update the existing Secrets Manager secret
`fieldkit/reinvent-2026/github` in the deployment account, region `us-west-1`.
Its JSON must contain `GITHUB_TOKEN` with the sandbox account's existing token.
Do not create a replacement account or token, or put this value in GitHub Actions
secrets: the Temporal workers need it through Fieldkit.

On Ian's trusted laptop, the import payload is already prepared at
`/Users/id/src/temporal/reinvent/2026/tmp/sdlc-credentials/github-secret.json`.
The directory is owner-only, the file is owner-readable/writable, and Git ignores
both. It contains only `GITHUB_TOKEN`, copied from the ignored `.env.sdlc.local`;
it does not contain or replace the runtime secret. The token expires
December 23, 2026.

The checked Fieldkit onboarding secrets wizard creates missing secrets; it does
not update an existing live secret. Use the deployment account's Secrets Manager
console to edit the existing secret,
or give that administrator the JSON through an approved secure channel. Verify the
AWS account and region before writing. Do not paste the payload into chat or copy
it to a booth machine. Remove the temporary JSON after installation is confirmed.

Fieldkit must pick up the changed secret and roll both `sdlc-worker-v1` and
`sdlc-worker-v2`. Verify they are running successfully afterward. A catalog status
of `Ready` alone does not prove the token is valid in the workers.

## 2. Match and activate the GitHub webhook

Use the repository owner's browser session, or a repository administrator with
webhook permission, to open:

<https://github.com/temporal-aws-reinvent-2026/reinvent-sdlc-sandbox/settings/hooks>

The available `iandouglas` CLI login has collaborator write access, not admin.
The sandbox account's runtime PAT also lacks the Webhooks permission. Neither can
administer this hook with the currently available credentials. Keep those extra
permissions off the runtime PAT.

Have the Fieldkit administrator retrieve `GITHUB_WEBHOOK_SECRET` from the existing
`fieldkit/reinvent-2026/runtime` secret and enter that exact value in the repository
webhook. Fieldkit generates this signing secret; do not replace the runtime JSON
or its `REDIS_PASSWORD` to configure GitHub.

Configure the existing booth webhook with:

- Payload URL: `https://reinvent-booth.tmprl-demo.cloud/agentic-sdlc/webhooks/github`
- Content type: `application/json`
- Secret: Fieldkit's exact `GITHUB_WEBHOOK_SECRET`
- SSL verification: enabled
- Events: Issues, Issue comments, Pull requests, Pull request reviews,
  Pull request review comments, and Workflow runs

Activate it after the hosted token is confirmed. Send a GitHub ping and confirm
its delivery gets a successful response. Then confirm a real scenario event
reaches the correct Temporal Workflow; a ping alone does not exercise that path.

## 3. Rehearse the hosted demo and station isolation

From the booth console, run all three scenarios against
`temporal-aws-reinvent-2026/reinvent-sdlc-sandbox`:

1. Start the dependency scenario, create its PR through the supplied GitHub link,
   and watch the agent repair it and complete its required check.
2. Start the review scenario, request a fix on its PR, and confirm the agent
   responds and updates that PR.
3. Start the issue scenario and approve its plan and production gates as
   `iandouglas` through **Actions → Review deployments**. Verify the hosted run
   resumes and finishes. Exercise the merge approval too when using supervised
   mode.

Use the console's scenario controls so each issue or PR gets its session label.
Verify signed webhook deliveries, real model calls, worker recovery and progress
in the console. Run two stations concurrently and reset one; the other station's
run must continue unaffected. Keep protected `main` and `baseline` unchanged;
scenario merges belong on their per-run branches.

## 4. Enable the booth card after rehearsal passes

Remove the Agentic SDLC card's fixed `tentative` launch flag only after the hosted
checks above pass. Merge that change into this monorepo's `main`, fast-forward
`fieldkit/onboarding-agent/suggested-changes` to the same commit, and verify the
hosted rollout. The flag is not an automatic readiness check.
