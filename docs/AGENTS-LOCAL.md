# Agent demo local previews

Agent Harness and Agentic SDLC use their actual web applications with local Temporal OSS. SDLC also uses local Redis. This is a presentation preview, not simulated successful agent execution.

The local adapter sets `LOCAL_PREVIEW=1`, clears provider credentials, and does not start either demo's model/GitHub workers. The backend rejects mutating HTTP requests with an explicit 503 response explaining the unavailable capability. SDLC also rejects reads of its deployed storefront routes, because those normally fetch files from GitHub. The hosted behavior is unchanged when `LOCAL_PREVIEW` is unset.

Both apps expose `/api/local-preview` under their normal demo prefix. This reports whether the backend is in presentation mode and which external capabilities are disabled. The real UI and read-only overview APIs can be reviewed without copying personal credentials to the demo stations.

To exercise real inference or SDLC pipelines later, add an explicit provider-enabled mode with a scoped booth sandbox and credential configuration. Do not remove the preview guard while continuing to label the app as offline, and do not substitute fake successful model results.

## Verified locally

Both Docker images built on November 21, 2026. Isolated web containers connected to the existing local Temporal server. Harness health, view, preview-status, and landing-page routes returned 200. SDLC health, config, overview, preview-status, and landing-page routes returned 200; its Redis ping passed.

Harness session creation returned 503 in preview mode. SDLC scenario creation, GitHub webhooks, and external storefront reads returned 503. With the preview flag removed in an isolated test client, Harness resumed its normal 422 request validation and SDLC resumed its normal 401 webhook signature check. These checks did not start provider workflows, call models, or modify GitHub.
