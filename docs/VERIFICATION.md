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
