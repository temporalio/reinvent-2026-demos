# The story

## The sentence

This demo shows an AI on-call agent that diagnoses an incident, proposes a fix and waits as long as
it takes for a person to approve it. The serverless runtime it runs on ends idle sessions, recycles
processes and bills for compute that sits waiting. A viewer can see each of those happen, and see
the agent pick up exactly where it stopped, with no model call repeated.

Your Strands agent, made durable with Temporal, running on AgentCore.

## The use case

An alert fires at 3 a.m. An agent reads the service's metrics, searches its logs, checks the recent
deploys, and proposes one change to production. Nobody wants an agent changing production on its
own, so it waits for the on-call engineer, who may answer in two minutes or in two hours.

## The problems

| Problem | Appears when | Resolved when | Proof |
|---|---|---|---|
| AgentCore ends an idle session, so a long approval wait outlives the process that started it. | The agent proposes a fix, the Worker drains and the Compute card says "No Worker running". | Approve: a new Worker starts and finishes the incident. | The Event History card shows "Worker 2 picked up the Workflow" after the Signal. |
| A recycled runtime loses everything in memory, including the agent's conversation. | The agent's process is replaced while it waits (locally `make kill-agent`; on AgentCore the session has already ended). | The new Worker continues from the proposal, not from the start. | Model and tool counts go up by only the calls after approval; Repeated stays 0. |
| Compute sits idle, and billed, while a person decides. | The approval wait. | Nothing runs while it waits; approval is what starts compute again. | Compute card: "No Worker running" for the whole wait, then the "Starting a Worker" banner on approval. |

## Sources

No number on screen comes from outside the demo. The service readings are simulated
(`agent/oncall/services.py`) and the same on every run of an incident.
