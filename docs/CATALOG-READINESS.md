# Catalog onboarding readiness

Ian authorized adding this repo to the SA catalog once it can provision and begin hosted testing. This gate is for initial hosted testing, not final physical-booth acceptance.

## Ready locally

The single DemoProject contains all nine apps and the launchpad. All nine local presentation routes run; six have local Temporal execution, while Loan/Travel/SDLC are clearly provider-limited previews. Native portrait layouts use Ash's styles, paired upper panels where applicable, and the shared lower information views. See VERIFICATION.md for exact checks.

## Blocking first hosted provisioning

1. Resolved: Fieldkit accepts spec.aws with aws-lambda components since temporal-fieldkit-platform #151 (main 77037f86), and the manifest validates against it. Live needs the platform promotion that includes it (DEPLOYMENT.md).
2. Merge the reviewed implementation/dependency PRs before intake. The catalog builds the upstream default branch; submitting the repo URL will not include unmerged feature branches.
3. Configure project-scoped provider, GitHub sandbox, runtime, and email secrets; verify the selected Bedrock model/region and IAM alignment. Do not reuse live SA demo keys or a personal sandbox repository.
4. Confirm the proposed reinvent-booth host/access mode. Public Temporal UI stays off until attendee payload visibility is resolved; the self-hosted read-only proxy feature is supported, but read-only does not hide Workflow inputs or results.

## Intake once those gates pass

Use the catalog's Add a Demo flow at /onboarding-agent/ and supply https://github.com/temporalio/reinvent-2026-demos. Tell the onboarding agent to use deploy/reinvent-2026.yaml, the one existing combined definition. Its start API takes repo_url and request_id, not a manifest-path argument. Do not replace the current live catalog demos.

Follow its review, secret configuration, crashable test, upstream merge, hosted test, and live gates. The same validator is used for drafts, so submitting the current unsupported AWS/Lambda definition cannot make provisioning succeed. No catalog registration or AWS resources have been created by this work.
