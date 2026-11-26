# SDLC durable agent compatibility

The SDLC worker now constructs ordinary Pydantic AI `Agent` instances with the `TemporalDurability` capability instead of the deprecated `TemporalAgent` wrapper. This uses the API already present in the pinned Pydantic AI 2.53.0 environment; no dependency pin was removed or upgraded by this change.

The migration keeps the four agent names, toolset IDs, model registry keys, and event stream handler. Model Activities retain the ten-second heartbeat timeout, ten-minute execution timeout, thirty-minute overall retry window, exponential backoff, and `ProviderRejected` non-retryable classification. The underlying tool Activities and their heartbeat/retry decorators are unchanged.

Harness tool adapters still run approval and dispatch in Workflow code. Their existing per-tool `False` configuration is now carried by each tool's `metadata['temporal']`, the supported capability configuration path. The harness still dispatches the actual I/O as its own Activity; the migration does not add another Activity around that orchestration. The existing `AgentPlugin(agent)` registration in the worker accepts the new agents.

Pydantic's [Temporal migration guidance](https://pydantic.dev/docs/ai/capabilities/durable_execution/temporal/) describes the compatibility conditions: retain agent names, toolset IDs, model registry keys, and the event handler on the durability capability while old executions remain in flight. We preserve those conditions. The old wrapper is scheduled for removal in Pydantic AI v3.

## Verification

Five tests run in the existing SDLC image with Docker networking disabled and synthetic `TestModel` instances. They verify names/registry/stream handling, heartbeat/retry settings, inline harness tool dispatch, registration of all legacy Activity names, and a synthetic model result. Worker imports and all four agent plugin registrations also pass with Pydantic AI deprecations treated as errors and a dummy provider key, with networking disabled.

No model/provider request or GitHub operation was performed. These checks do not claim replay of retained production histories or a live provider-backed SDLC pipeline. The other harness compatibility adapters, such as usage extraction and streaming accounting, still need their own tests when updating Pydantic AI or the harness dependency.
