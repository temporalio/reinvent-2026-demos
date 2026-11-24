# The story

## The sentence

This demo shows an AI engineering agent aboard Ziggy's starship that diagnoses a fault, proposes a
repair and waits as long as it takes for the captain to approve it. The serverless runtime it runs on ends idle sessions, recycles
processes and bills for compute that sits waiting. A viewer can see each of those happen, and see
the agent pick up exactly where it stopped, with no model call repeated.

Your Strands agent, made durable with Temporal, running on AgentCore.

## The use case

An alarm sounds on Ziggy's starship: the gravity plating flickers, the galley replicator only makes
lukewarm soup, the shields buckle in a meteor shower. The engineering agent reads the system's
telemetry, searches its logs, checks the maintenance record, and proposes one repair. Nobody wants
an agent rewiring the ship on its own, so it waits for the captain, who may answer in two minutes
or in two hours.

It's the on-call story every operations team knows (an alert, an investigation, a change that needs
a human's yes) told with a starship so a booth visitor can play the captain. Claude Haiku writes
six new alarms for every visit, so the visitor never sees the same incident twice and doesn't know
the cause until the agent finds it.

## The problems

| Problem | Appears when | Resolved when | Proof |
|---|---|---|---|
| AgentCore ends an idle session, so a long approval wait outlives the process that started it. | The agent proposes a repair, the Worker drains and the Compute card says "No Worker running". | Approve: a new Worker starts and finishes the incident. | The Event History card shows "Worker 2 picked up the Workflow" after the Signal. |
| A recycled runtime loses everything in memory, including the agent's conversation. | The agent's process is replaced while it waits (locally `make kill-agent`; on AgentCore the session has already ended). | The new Worker continues from the proposal, not from the start. | Model and tool counts go up by only the calls after approval; Repeated stays 0. |
| Compute sits idle, and billed, while a person decides. | The approval wait. | Nothing runs while it waits; approval is what starts compute again. | Compute card: "No Worker running" for the whole wait, then the "Starting a Worker" banner on approval. |

## Sources

No number on screen comes from outside the demo. The ship's readings are simulated
(`agent/oncall/services.py`) and the same on every run of an incident. Haiku writes each alarm's
story and log lines; the API sets the evidence the agent reasons from (when each firmware went in,
what the right repair targets), so the evidence always fits the cause
(`api/internal/oncall/incidents.go`).
