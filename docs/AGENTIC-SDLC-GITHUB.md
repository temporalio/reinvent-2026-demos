# GitHub setup for the SDLC booth demo

The booth uses the dedicated demo account and public sandbox repository [`temporal-aws-reinvent-2026/reinvent-sdlc-sandbox`](https://github.com/temporal-aws-reinvent-2026/reinvent-sdlc-sandbox). Seed it from this monorepo's `apps/agentic-sdlc/sandbox-template/`, not from the full demo application. The agents will write commits, issues, PRs, comments, and temporary branches there. Keep the launchpad/demo monorepo separate.

No extra application repositories are needed. The template depends on the existing public `temporal-sa/orbit-money` repository at `v1.0.0`; the dependency scenario bumps it to `v2.0.0`. It does not require write access or a fork of that package.

A public sandbox avoids a GitHub plan limitation: required Environment reviewers are available only for public repositories on Free, Pro, and Team plans. A private sandbox needs a plan that supports those gates. [GitHub environment rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

## What needs a login

The worker reads a **fine-grained PAT** from `GITHUB_TOKEN`; there is no GitHub App installation or browser OAuth flow in this implementation. Agent comments appear as the token owner's account. Give this token access only to the new sandbox, with these repository permissions set to **Read and write**: Contents, Pull requests, Issues, Commit statuses, and Actions. Metadata read access is automatic. This matches the existing [token runbook](../apps/agentic-sdlc/RUNBOOK.md#rotate-the-github-token). [GitHub PAT setup](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

The runtime token does not need repository Administration or Webhooks permissions. Use an administrator's separate GitHub CLI/browser login for initial rules, Environments, webhook, and template setup. Creating or changing Actions workflow files during setup may require the setup credential's Workflows permission; do not add it to the runtime token merely to bootstrap the repository.

Treat the four borrowed Mac Minis as untrusted, browser-only kiosks. Do not install AWS credentials, provider keys, the GitHub token, private env files, or a signed-in GitHub owner session there. The hosted backend owns those credentials. Staff complete the GitHub steps from a trusted laptop or phone as `iandouglas`: create the dependency PR, steer agents through comments, and approve **Actions → Review deployments**. The kiosks show the demo console; its GitHub links do not remove these staff steps. The server’s PAT does not sign a browser in.

## Prepare the sandbox

1. Create the new repository with `main` as the default branch and Issues enabled. Use only demo content. Enable Actions, including the bundled `actions/checkout` action and GitHub-hosted Ubuntu runners.
2. Copy **all** of `sandbox-template/`, including its hidden `.github/workflows/` directory, into its root. It supplies `package.json`, `src/`, `tests/`, the static storefront, `dependency-bump.yml`, and `release.yml`. Commit and push that baseline to `main`; make a lightweight tag named `baseline` at the same commit. The tests run with `npm install` followed by `npm test` (`node --test tests/`).
3. Create a branch `samples/discount-rounding` from baseline, replacing its `src/` and `tests/` with the corresponding bundled `sandbox-samples/discount-rounding/` files, then commit and push. It intentionally contains discount/tax/rounding bugs for the review scenario.
4. In **Settings → Rules → Rulesets**, create `protect-baseline`, targeting only `main`, and `protect-baseline-tag`, targeting only the `baseline` tag. Protect both against updates, deletion, and force pushes; do not apply those restrictions to the agent's temporary branches. The main ruleset also requires the status check `agentic-sdlc/agent-review`. These named rulesets must already exist before the bundled setup script can run. [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
5. In **Settings → Environments**, create `plan-approval`, `merge-approval`, and `production`. Add the demo presenter as a required reviewer on each. Leave **Prevent self-review** off if the same account's PAT dispatches releases and that account will approve them. Allow the demo's temporary branches to deploy; restricting these gates to `main` prevents the per-run release flow.
6. Create labels `agent`, `dependencies`, `agent-plan`, and `rolled-back`. Owner/session labels are created by the app as scenarios start.

The existing [`setup-github.sh`](../apps/agentic-sdlc/scripts/setup-github.sh) can seed/update the template, sample branch, labels, main check, and Environments after the named rulesets exist. **Do not run it unchanged for the booth yet:** it selects the target repository only from the app's `.env.local`, falling back to the SA storefront. Its optional webhook step also reads the original catalog's hardcoded AWS runtime secret. It rewrites sandbox content and force-updates the baseline/sample refs, so run setup between rehearsals, never during active sessions. Use the manual steps above until the helper is adapted to the booth's project-scoped configuration.

## Connect the booth backend

Set `GITHUB_SANDBOX_REPO=<demo-account>/reinvent-sdlc-sandbox` consistently on `sdlc-web`, `sdlc-worker-v1`, and `sdlc-worker-v2` in the single deployment YAML. The manifest sets the booth-owned repository on all three components. This setting alone does not configure the hosted token or webhook. Supply the PAT through its `github` secret and `GITHUB_WEBHOOK_SECRET` through the runtime secret, following [DEPLOYMENT.md](DEPLOYMENT.md). Do not put either value in git or the launchpad's browser configuration.

Create a repository webhook in **Settings → Webhooks**:

- Payload URL: the deployed core URL plus `/agentic-sdlc/webhooks/github`; the prepared webhook address is `https://reinvent-booth.tmprl-demo.cloud/agentic-sdlc/webhooks/github`. Confirm the actual ingress URL before saving.
- Content type: `application/json`; secret: the backend's exact `GITHUB_WEBHOOK_SECRET`; SSL verification enabled.
- Select **Issues**, **Issue comments**, **Pull requests**, **Pull request reviews**, **Pull request review comments**, and **Workflow runs**.

GitHub must reach that public endpoint. `PUBLIC_URL` must be the same externally reachable app base so the app's storefront links work. Local Docker preview alone does not provide webhook delivery. The upstream `scripts/dev.py` alternative uses `gh webhook forward` with a CLI login that has `admin:repo_hook`; the documented limitation is one forwarder per repository. Do not start four such forwarders against one sandbox.

## Four stations and rehearsal

One hosted SDLC backend and one sandbox support concurrent browsers: each active browser leases a session slot, with its own owner label, task queue, branches, and reset scope. Current configuration defaults to eight slots when `TEMPORAL_TASK_QUEUE` equals `BASE_TASK_QUEUE`; the booth manifest sets both to `ri26-sdlc`. Four separate repositories are unnecessary for that deployment. Separate browser cookies identify sessions, not separate GitHub accounts. Worker-version rollout still affects the shared deployment.

Before enabling the demo card, rehearse all three scenarios: create the dependency PR and watch its required check complete; open the sample review and request a fix; open an issue and approve its plan/production gates. Verify signed webhook deliveries succeed, presenter comments reach the correct session, and resetting one station leaves another station's run alone. The issue flow merges into a per-run base branch created from `baseline`, rather than changing the protected `main`.

## Setup status: November 23, 2026

- Seeded `main` and the `baseline` tag at `97651dd`; published the intentional review exercise on `samples/discount-rounding` at `33471b0`. Baseline tests passed (6), as did the sample’s intentionally incomplete test suite (8), in Docker. The baseline uses `node --test tests/*.test.js` so Node 22 discovers the tests.
- Active rulesets `protect-baseline` and `protect-baseline-tag` protect only `main` and the `baseline` tag. Main requires `agentic-sdlc/agent-review`. Agent run branches remain writable.
- `plan-approval`, `merge-approval`, and `production` require `iandouglas` as reviewer. Temporary run branches may deploy.
- The demo-owned token authenticates as `temporal-aws-reinvent-2026` and has sandbox push access. It expires December 23, 2026. It is retained only in the trusted laptop’s ignored, owner-readable local configuration; it has not been installed in the hosted backend.
- Webhook `715899524` subscribes to the six events above, verifies TLS, and has a signing secret. **It is inactive** until the hosted backend has the same signing secret and the real token. GitHub sends an initial creation ping even when a hook is inactive; successful signed delivery has not been verified.

A Fieldkit administrator must update the existing `fieldkit/reinvent-2026/github` secret (`GITHUB_TOKEN`) and the `GITHUB_WEBHOOK_SECRET` property of `fieldkit/reinvent-2026/runtime`, preserving its other properties. Use a secure credential handoff, never Git, chat, or a kiosk. Verify the actual deployment account and region before any write. Ian’s personal AWS account is not the Fieldkit deployment account. Fieldkit’s current onboarding wizard is create-only and cannot rotate these existing secrets.

After the backend has picked up those values, enable the prepared webhook, verify a signed delivery, and rehearse the three scenarios and station isolation above. Hosted installation and end-to-end SDLC execution remain unverified.

Source: [`config.py`](../apps/agentic-sdlc/agentic_sdlc/config.py), [`GitHubActivities`](../apps/agentic-sdlc/agentic_sdlc/activities/github.py), [`webhooks.py`](../apps/agentic-sdlc/agentic_sdlc/web/webhooks.py), [`sessions.py`](../apps/agentic-sdlc/agentic_sdlc/web/sessions.py), [`setup-github.sh`](../apps/agentic-sdlc/scripts/setup-github.sh), and [`reinvent-2026.yaml`](../deploy/reinvent-2026.yaml).
