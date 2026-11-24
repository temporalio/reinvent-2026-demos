# Upstream source

Imported from https://github.com/temporal-sa/temporal-demo-agentcore-oncall at `78a52950c2c88f4fcec7904cade3aa964e6949f7`.

The existing `agentcore-research` station key and directory are retained so saved station settings continue to work. The booth title is AgentCore On-Call and its route is `/agentcore-oncall/`.

Booth changes: Cosmic Pop styling, touch keyboard for the optional approval note, same-origin framing and path-prefix support. The local adapter uses the upstream scripted model with real Temporal Workflows and a local invocation controller. It does not claim to run AWS AgentCore or Bedrock locally.

Hosted launch remains gated: pinned Fieldkit 77037f86 only supports `aws-lambda`, not `aws-agentcore`. The API is included in the single booth manifest. The AgentCore worker is not silently replaced with an always-running worker or mock model in production. `docs/upstream-demoproject.yaml.example` records the required future AgentCore settings; it is not a second deployment.
