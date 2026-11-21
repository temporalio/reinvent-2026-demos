# Remaining demo rollout

1. Inspect runtime requirements, current dependency PRs, and styling/layout gaps. Record the plan and commit.
2. Implement local adapters for No Roads and Loan, and for Agent Harness and Agentic SDLC where credentials allow. Keep hosted Lambda behavior intact. Explicitly label native-worker substitutions and provider-limited runs.
3. Apply Ash's shared styles and portrait panel adapters to every native demo. Preserve one live application session and its existing controls. Verify at portrait dimensions.
4. Test dependency updates from the open GitHub PRs. Add runtime compatibility checks for the affected app rather than relying on launchpad-only builds. Keep updates reviewable; do not merge PRs.
5. Integrate, run local workflows and browser checks, record exact limits, and push reviewable changes. Configure recurring dependency checks if the automation tools support the requested watch.

No real AWS provisioning, provider calls, emails, GitHub sandbox mutations, or credential disclosure is required to validate the default local presentation. Provider-enabled modes need explicit configuration and must be reported separately from offline/mock previews.
