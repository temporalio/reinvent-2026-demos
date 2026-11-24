"""The on-call agent's Temporal Worker, served as an Amazon Bedrock AgentCore Runtime.

This follows Temporal's documented pattern for AgentCore
(https://docs.temporal.io/develop/python/workers/serverless-workers/agentcore):
`BedrockAgentCoreApp` serves GET /ping and POST /invocations on port 8080.
Temporal Cloud invokes /invocations when the Task Queue has work and no Worker;
the handler starts a normal long-lived Worker as an AgentCore async task and
answers at once. The Worker polls until no Activity has run for
AGENTCORE_DEBOUNCE_SECONDS, drains, and releases the async task, so /ping goes
back to Healthy and AgentCore can end the idle session.

Nothing here keeps agent state. A new session starts with an empty process,
and the Workflow's Event History brings the agent back to where it stopped.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys
import uuid
from datetime import timedelta

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from temporalio.client import Client
from temporalio.common import VersioningBehavior, WorkerDeploymentVersion
from temporalio.envconfig import ClientConfig
from temporalio.runtime import Runtime, TelemetryConfig
from temporalio.strands_agents import StrandsPlugin
from temporalio.worker import (
    ActivityInboundInterceptor,
    ExecuteActivityInput,
    Interceptor,
    Worker,
    WorkerDeploymentConfig,
)

from oncall import activities, workflows
from oncall.models import MODEL_NAME, ConfigError, model_factory_from_env

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="time=%(asctime)s level=%(levelname)s logger=%(name)s msg=%(message)r",
)

app = BedrockAgentCoreApp()
log = logging.getLogger("oncall.worker")

# The background Worker, when one is running. Holds the strong reference that
# asyncio.create_task() does not keep, and doubles as the "already polling?" flag.
_worker: asyncio.Task[None] | None = None


def _required(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise ConfigError(f"{name} is not set")
    return value


# Read once at start. On the platform the operator sets the deployment name and
# Build ID it registered with Temporal Cloud; a Worker that reported any other
# version would start on invoke and never receive a task. Missing values stop
# the process here, which AgentCore reports as a failed runtime version.
try:
    TASK_QUEUE = _required("TEMPORAL_TASK_QUEUE")
    DEPLOYMENT_NAME = _required("TEMPORAL_DEPLOYMENT_NAME")
    BUILD_ID = _required("TEMPORAL_WORKER_BUILD_ID")
    MODEL_FACTORY = model_factory_from_env()
except ConfigError as err:
    log.error("cannot start: %s", err)
    sys.exit(2)

# Worker heartbeats are how the UI sees a Worker start and stop (ListWorkers,
# which needs no Worker to answer). Every 10 s instead of the SDK's 60 s, so a
# process that dies without draining shows as gone within about 30 s.
RUNTIME = Runtime(telemetry=TelemetryConfig(), worker_heartbeat_interval=timedelta(seconds=10))

# How long the Worker keeps polling after it goes idle.
DEBOUNCE = float(os.environ.get("AGENTCORE_DEBOUNCE_SECONDS", "60"))
# How long the drain waits for in-flight Activities (a model or tool call).
DRAIN = timedelta(seconds=120)


class ActivityTracker(Interceptor):
    """Counts in-flight Activities and waits until none has started or finished for a while.

    The model calls and tool calls are all Activities, so this sees the
    agent's whole turn and never retires the Worker mid-thought. A Workflow
    that is only waiting for approval runs no Activities, so the Worker
    drains while it waits.
    """

    def __init__(self) -> None:
        self.inflight = 0
        self.changed = asyncio.Event()

    def intercept_activity(self, next: ActivityInboundInterceptor) -> ActivityInboundInterceptor:
        return _TrackedActivity(next, self)

    async def wait_until_idle(self, debounce: float) -> None:
        """Return once no Activity has run for ``debounce`` seconds."""
        while True:
            self.changed.clear()
            try:
                # Wake the moment an Activity starts or finishes; a timeout
                # instead means nothing has happened for the whole window.
                await asyncio.wait_for(self.changed.wait(), timeout=debounce)
            except asyncio.TimeoutError:
                if self.inflight == 0:
                    return


class _TrackedActivity(ActivityInboundInterceptor):
    def __init__(self, next: ActivityInboundInterceptor, tracker: ActivityTracker) -> None:
        super().__init__(next)
        self._tracker = tracker

    async def execute_activity(self, input: ExecuteActivityInput):
        self._tracker.inflight += 1
        self._tracker.changed.set()
        try:
            return await self.next.execute_activity(input)
        finally:
            self._tracker.inflight -= 1
            self._tracker.changed.set()


async def run_worker() -> None:
    """Poll until idle, then drain."""
    # Address, namespace, API key and TLS come from TEMPORAL_* env vars. The
    # config file is off so a developer's CLI profile can't redirect the Worker.
    connect = ClientConfig.load_client_connect_config(disable_file=True)
    # The Strands plugin goes on the Client so its data converter (and its
    # interrupt handling) applies to everything this Client does, including
    # the Worker built from it.
    client = await Client.connect(**connect, runtime=RUNTIME, plugins=[StrandsPlugin(models={MODEL_NAME: MODEL_FACTORY})])

    # One name per Worker process start, so the history shows which Worker
    # ran each step even when a container keeps its hostname.
    identity = f"oncall-agent@{socket.gethostname()}#{uuid.uuid4().hex[:6]}"
    tracker = ActivityTracker()
    log.info("worker polling task_queue=%s deployment=%s build_id=%s identity=%s", TASK_QUEUE, DEPLOYMENT_NAME, BUILD_ID, identity)
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        identity=identity,
        workflows=[workflows.IncidentWorkflow],
        activities=activities.TOOLS,
        interceptors=[tracker],
        deployment_config=WorkerDeploymentConfig(
            version=WorkerDeploymentVersion(deployment_name=DEPLOYMENT_NAME, build_id=BUILD_ID),
            use_worker_versioning=True,
            # Pinned: an incident finishes on the code it started on, even when
            # a new Build ID ships while it waits for approval. The old
            # version's AgentCore endpoint stays until its incidents drain.
            default_versioning_behavior=VersioningBehavior.PINNED,
        ),
        graceful_shutdown_timeout=DRAIN,
    )
    async with worker:
        await tracker.wait_until_idle(DEBOUNCE)
    log.info("worker idle for %ss; drained identity=%s", DEBOUNCE, identity)


async def _run_until_idle(task_id: int) -> None:
    """Own the Worker's whole life, and always release the async task."""
    try:
        await run_worker()
    except Exception:
        # Nothing awaits this task, so an error would otherwise be swallowed.
        log.exception("worker failed in async task")
    finally:
        # Without this the session stays HealthyBusy until MaxLifetime.
        app.complete_async_task(task_id)


@app.entrypoint
async def invoke(payload: dict) -> dict:
    """Start the Worker and acknowledge. The payload is unused."""
    global _worker
    if _worker is not None and not _worker.done():
        log.info("worker already polling task_queue=%s", TASK_QUEUE)
        return {"message": "worker already polling", "task_queue": TASK_QUEUE}

    task_id = app.add_async_task("temporal-worker")
    _worker = asyncio.create_task(_run_until_idle(task_id))
    log.info("invoked; starting worker task_queue=%s", TASK_QUEUE)
    return {"message": "worker starting", "task_queue": TASK_QUEUE}


if __name__ == "__main__":
    # AgentCore's contract is 0.0.0.0:8080. BedrockAgentCoreApp guesses the
    # host from /.dockerenv, which an AgentCore microVM need not have, so the
    # host is set explicitly.
    app.run(host="0.0.0.0", port=8080)
