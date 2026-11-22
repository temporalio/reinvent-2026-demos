# Local No Roads and Loan modes

The local No Roads adapter builds the existing Go web app and native long-polling worker in one multi-architecture image. It uses the same Workflow and Activities against local Temporal OSS. The init service makes the manifest's worker deployment version Current after its pollers register. The runtime endpoint at `/no-roads/api/runtime` identifies this mode, and the greeting Activity says "local native worker" rather than "Lambda".

This exercises submission, backlog, concurrency limits, metrics, and Workflow history. It does not exercise AWS Lambda cold starts, scale-out, worker invocation, or IAM. The hosted Lambda build and single Fieldkit YAML are unchanged.

Loan defaults to a provider-free presentation mode. Its profiles and application forms are available, and `/loans/api/runtime` reports `execution_available: false`. Mutation routes for application submission and human decisions return HTTP 503 with `provider_unavailable`, including behind the `/loans` root path. No local Loan worker is started, so the preview does not enqueue applications that cannot finish or silently make Bedrock calls.

Loan's Temporal connection helper accepts Fieldkit's generic connection variables and preserves the original `TEMPORAL_CLOUD_*` and `TEMPORAL_LOCAL_*` overrides. Explicit local mode never uses inherited Cloud API keys. Actual underwriting still requires a provider-enabled worker and a separate validated model-access configuration.
