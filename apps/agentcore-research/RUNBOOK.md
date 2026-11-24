# Runbook: On-call agent on AgentCore

## What it shows

An AI on-call agent diagnoses an incident, proposes a fix and waits as long as it takes for a person
to approve it. Your Strands agent, made durable with Temporal, running on AgentCore.

It makes three problems visible ([docs/story.md](docs/story.md)):

1. AgentCore ends an idle session, so a long approval wait outlives the process that started it.
2. A recycled runtime loses everything in memory, including the agent's conversation.
3. Compute sits idle, and billed, while a person decides.

## Before you start

- **Where:** the catalog card "On-call Agent on AgentCore" on tmprl-demo.cloud opens
  `https://agentcore-oncall.<catalog domain>`. You need a Temporal sign-in for the catalog.
- **Shared deployment, separate incidents.** There is no crashable copy. Every presenter shares one
  agent runtime, and each browser sees only its own incidents. Another presenter's incident can wake
  the Worker while you talk; the Compute card shows that honestly.
- **Before the audience arrives:** open the demo and check the Compute card says "No Worker running".
  If a Worker is running, wait a minute for it to drain, so your first incident shows a cold start.

## Start it

Open the demo. A healthy start shows three alerts, the Compute card ("No Worker running", no compute
in use), and an empty Event History card. The freshness dot in the top bar says Live.

## The walkthrough

### 1. Page the agent

Click **checkout-api · Checkout errors after a deploy**, then **Start incident**.

The audience sees the "Starting a Worker" banner, then "Worker running", then the agent's steps
arrive: metrics, logs, deploys, each with what it found.

Say: "Nothing was running a second ago. Starting the incident gave Temporal work, and Temporal Cloud
invoked the agent on AgentCore. Each of those steps is a model call or a tool call, and each one is
recorded in Temporal."

Proof: the Event History card, one row per model and tool call and the Worker that ran it.

### 2. The agent asks before it changes production

The agent proposes "rollback v2.13.2" with its reasoning, and the badge says **Waiting for approval**.
Don't approve yet.

Say: "This is a Strands agent. Its tool call to change production stops at a hook, and Temporal holds
the agent right there. A person might answer in two minutes or two hours."

### 3. No compute while it waits (problems 1 and 3)

Wait about a minute. The Compute card changes to **No Worker running**.

Say: "The Worker ran out of work and drained, and AgentCore ended the idle session. Nothing is running
and nothing is billing. The agent's whole conversation is in Temporal's Event History, not in a
process."

Proof: the Compute card, read from Temporal's Worker heartbeats. The incident card still shows every
step, read with Describe, not from the agent.

### 4. Approve: a new process picks up where the agent stopped (problem 2)

Add a note if you like, then click **Approve fix**.

The banner says "Starting a Worker", a new Worker starts, applies the rollback, and the agent closes
the incident with the recovered numbers. The badge says **Resolved**.

Say: "That approval was recorded the moment I clicked, with nothing running. Recording it is what
started compute again. A brand-new process replayed the history and carried on from the proposal."

Proof: the Event History card. "Decision Signal recorded", then "Worker 2 picked up the Workflow",
then only the calls after approval. **Repeated** stays 0: no model call or tool call ran twice.
Open **Temporal UI** for the full history.

### 5. Optional: reject instead

Start another incident and click **Reject** with a note such as "not during peak". The fix is not
applied, and the agent closes the incident and escalates. The note reaches the model as the tool's
result.

## Show it in code

### Run a Strands agent as a durable Workflow

**When:** "What did it take to make the agent durable?"

**Where:** [`agent/oncall/workflows.py:77-92`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/agent/oncall/workflows.py#L77-L92) (`code -g agent/oncall/workflows.py:77`)

```python
self._agent = TemporalAgent(
    model=MODEL_NAME,
    start_to_close_timeout=timedelta(seconds=60),
    retry_policy=RetryPolicy(maximum_attempts=5),
    system_prompt=SYSTEM_PROMPT,
    tools=[
        activity_as_tool(tool, start_to_close_timeout=timedelta(seconds=20), retry_policy=RetryPolicy(maximum_attempts=5))
        for tool in activities.TOOLS
    ],
    hooks=[ApprovalGate(), Progress(self)],
    callback_handler=None,
)
```

**What to understand:** `TemporalAgent` is a Strands `Agent` whose model calls run as the plugin's
`invoke_model` Activity, and `activity_as_tool` makes each tool an Activity. The tools are ordinary
async functions with docstrings; Strands builds their schemas. The model name maps to a factory
registered on the Worker (`StrandsPlugin(models={...})`), so the Bedrock client lives on the Worker,
never in the Workflow. The customer doesn't write a model loop, a checkpoint, or any state store.
Docs: [temporalio-strands-agents](https://pypi.org/project/temporalio-strands-agents/).

### Stop the agent before it changes production

**When:** "How does the human approval work?" (beat 2)

**Where:** [`agent/oncall/workflows.py:154-170`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/agent/oncall/workflows.py#L154-L170) (`code -g agent/oncall/workflows.py:154`)

```python
class ApprovalGate(HookProvider):
    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self._gate)

    def _gate(self, event: BeforeToolCallEvent) -> None:
        if event.tool_use["name"] != activities.apply_remediation.__name__:
            return
        response = event.interrupt("remediation-approval", reason=event.tool_use["input"])
        if response != "approve":
            event.cancel_tool = f"Not applied: the change was {response}."
```

**What to understand:** a Strands hook interrupt. The first time the agent calls
`apply_remediation`, `interrupt` stops the agent and `invoke_async` returns with stop reason
`interrupt`, carrying the proposed tool input. When the Workflow resumes the agent with an answer,
the same hook runs again and `interrupt` returns that answer. A rejection cancels the tool call, and
the model sees why.

### Wait for a person with nothing running

**When:** beat 3, "what is running while it waits?"

**Where:** [`agent/oncall/workflows.py:101-119`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/agent/oncall/workflows.py#L101-L119) and the Signal at [`126-137`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/agent/oncall/workflows.py#L126-L137) (`code -g agent/oncall/workflows.py:101`)

```python
while result.stop_reason == "interrupt":
    interrupt = result.interrupts[0]
    # ...
    self._set_phase("awaiting_approval", proposal=interrupt.reason, decision=None)
    try:
        await workflow.wait_condition(lambda: self._decision is not None, timeout=APPROVAL_TIMEOUT)
        # ...
    except asyncio.TimeoutError:
        decision = Decision(approved=False, approver="nobody", note="no decision within 24 hours")
    # ...
    result = await self._agent.invoke_async([{"interruptResponse": {"interruptId": interrupt.id, "response": response}}])
```

**What to understand:** `wait_condition` with a 24-hour timeout is a durable timer: the server holds
it, so the Worker can drain and the AgentCore session can end. The `decide` Signal is written to the
history at once, with no Worker; that new Workflow Task is what makes Temporal Cloud invoke a Worker.
A Signal rather than an Update, because an Update's caller waits for a Worker to accept it, which here
would mean waiting through a cold start. The interrupt ID is derived from the tool call, so it is the
same on replay. Docs: [Signals](https://docs.temporal.io/develop/python/message-passing#signals).

### Serve the Worker as an AgentCore runtime

**When:** "How does a Worker run on AgentCore?" (beats 1 and 4)

**Where:** [`agent/agentcore_worker.py:181-192`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/agent/agentcore_worker.py#L181-L192) and the drain at [`164-166`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/agent/agentcore_worker.py#L164-L166) (`code -g agent/agentcore_worker.py:181`)

```python
@app.entrypoint
async def invoke(payload: dict) -> dict:
    global _worker
    if _worker is not None and not _worker.done():
        return {"message": "worker already polling", "task_queue": TASK_QUEUE}

    task_id = app.add_async_task("temporal-worker")
    _worker = asyncio.create_task(_run_until_idle(task_id))
    return {"message": "worker starting", "task_queue": TASK_QUEUE}
```

**What to understand:** Temporal's documented pattern. `BedrockAgentCoreApp` answers `/ping` and
`/invocations` on port 8080. An invocation starts an ordinary long-lived Worker as an AgentCore async
task, so `/ping` says `HealthyBusy` and AgentCore keeps the session. An interceptor counts in-flight
Activities; after `AGENTCORE_DEBOUNCE_SECONDS` with none, the Worker drains and the task completes,
and AgentCore ends the session after `idleSessionTimeoutSeconds`. The Worker uses Worker Versioning
with Pinned Workflows, from the deployment name and Build ID the platform sets. Docs:
[Serverless Workers on AgentCore](https://docs.temporal.io/develop/python/workers/serverless-workers/agentcore).

### Show state without a running Worker

**When:** "How does the screen know what the agent is doing when nothing is running?"

**Where:** [`api/internal/oncall/server.go:64-104`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/api/internal/oncall/server.go#L64-L104) and [`api/internal/oncall/worker.go:38-76`](https://github.com/temporal-sa/temporal-demo-agentcore-oncall/blob/c9d73817c302c17dba1c22b9b4c51adadc88a384/api/internal/oncall/worker.go#L38-L76) (`code -g api/internal/oncall/server.go:64`)

**What to understand:** one poll reads DescribeWorkflowExecution (the memo and the `OncallPhase`
Search Attribute the Workflow keeps current, plus any task waiting for a Worker), the Event History,
and Worker heartbeats (ListWorkers, then DescribeWorker). None needs a Worker, none is a billable
Action, and none wakes the agent. A Query would do all three wrong: it needs a Worker, it would wake
one, and each is an Action. A heartbeat older than 25 s counts as a gone Worker.

## Reset and tear down

Nothing to reset between presenters: each incident is its own Workflow, and each browser sees only
its own. Start another with **New incident**.

Nothing keeps running. A finished incident uses no compute, and an unanswered one closes itself
after 24 hours (its timer is the only thing it costs while it waits). AgentCore ends each idle
session after 60 seconds.

One incident costs 16 Actions on Temporal Cloud: the start, 10 Activities (5 model calls, 4 tool
calls and the plugin's one model-config read), the approval timer, the Signal and 3 Search Attribute
upserts, counted from a real run's Event History. The memo updates and the screen's reads cost none.

## When something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| "Starting a Worker" stays up for more than 30 s | Temporal Cloud can't invoke the runtime, or the Worker fails at start | In the Temporal UI, open the Worker Deployment and check the version is current; check the runtime's log group `/aws/bedrock-agentcore/runtimes/<runtime id>-<endpoint>` |
| The agent's step fails with `AccessDeniedException` | Bedrock model access isn't enabled in the AWS account | An AWS admin enables the model once per account (docs/catalog.md, 8) |
| Compute card says "Can't tell" | ListWorkers is unavailable to the API's key | The incident still works; say the card is unavailable |
| Approve does nothing | The incident already has a decision, or it closed after 24 hours | Start a new incident |
| The model says "stub (scripted, offline)" on the hosted demo | `AGENT_MODEL=stub` in the component's env | Set `AGENT_MODEL: bedrock` in the DemoProject |

## Run it locally

Prerequisites: Docker, Docker Compose and `make`. Variables are listed in `.env.example`.

```sh
make demo        # build the images and start the stack: dev server, agent, local-invoker, API
make test        # Python workflow tests and Go API tests, in containers
make e2e         # the whole story through the published ports, against `make demo`
make kill-agent  # replace the agent's process, like a new AgentCore session
make invoke      # POST /invocations by hand, as Temporal Cloud would
make arm64       # build the agent image for linux/arm64, the only architecture AgentCore runs
make reset       # back to the starting state
```

- Demo: http://localhost:8080. Temporal UI: http://localhost:8233. The agent's AgentCore contract:
  http://localhost:8081/ping and `/invocations`.
- **Who invokes the agent locally.** `local-invoker` stands in for Temporal Cloud: it makes the
  Worker Deployment Version current, then POSTs `/invocations` whenever the version has backlog and
  no live Worker. On the platform, Temporal Cloud does this and `local-invoker` does not exist.
- **The model.** Locally the agent uses a scripted stub (`AGENT_MODEL=stub`), which follows the
  same tool calls a model would and says so on screen. To use Bedrock, put `AGENT_MODEL=bedrock`,
  `BEDROCK_MODEL_ID`, `AWS_REGION` and AWS credentials in `.env`, then `make demo`.
- **Timing.** Compose sets `AGENTCORE_DEBOUNCE_SECONDS=20`, so the Worker drains 20 s after the
  proposal. Restarting the agent container (`make kill-agent`) shows a recycled runtime.
- **Troubleshooting.** `docker compose logs agent local-invoker` shows each invocation, each Worker
  start and each drain. The agent exits at start with "cannot start: ..." when a required variable is
  missing.
