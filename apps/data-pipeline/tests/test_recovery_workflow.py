"""Exercise the touchscreen recovery checkpoint and replay with a real Temporal server."""
import asyncio
from collections import Counter
import os
import unittest
from uuid import uuid4
from unittest.mock import AsyncMock, patch

from ui.app import app, recover

from temporalio import activity
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Replayer, Worker

from DataPipelineWorkflowScenarios import DataPipelineWorkflowScenarios
from dataobjects import DataPipelineParams
from ui.progress import summarize

CALLS = Counter()


@activity.defn(name="get_available_task_queue")
async def select_worker() -> str:
    CALLS["get_available_task_queue"] += 1
    return activity.info().task_queue


@activity.defn(name="validate")
async def validate_file(input: DataPipelineParams) -> bool:
    CALLS["validate"] += 1
    return True


@activity.defn(name="extract")
async def extract_file(input: DataPipelineParams) -> str:
    CALLS["extract"] += 1
    return "success"


@activity.defn(name="transform")
async def transform_file(input: DataPipelineParams) -> str:
    CALLS["transform"] += 1
    return "success"


@activity.defn(name="load")
async def load_file(input: DataPipelineParams) -> str:
    CALLS["load"] += 1
    return "success"


@activity.defn(name="poll")
async def poll_result(input: DataPipelineParams, workflow_type: str) -> str:
    CALLS["poll"] += 1
    return "complete"


class RecoveryWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_signal_recovers_same_run_without_repeating_activities(self):
        CALLS.clear()
        options = {}
        if path := os.getenv("TEMPORAL_CLI_PATH"):
            options["dev_server_existing_path"] = path
        async with await WorkflowEnvironment.start_local(**options) as env:
            queue = "pipeline-test-" + uuid4().hex
            worker_options = dict(task_queue=queue, workflows=[DataPipelineWorkflowScenarios],
                                  activities=[select_worker, validate_file, extract_file, transform_file, load_file, poll_result])
            async with Worker(env.client, **worker_options):
                handle = await env.client.start_workflow(
                    "DataPipelineRecoverableFailure",
                    DataPipelineParams("info.json", "poll", "unused", "orange", "RecoverableFailure", "test"),
                    id="datapipeline-" + uuid4().hex, task_queue=queue,
                )
                run_id = handle.first_execution_run_id
                async def wait_for_bug():
                    while True:
                        history = await handle.fetch_history()
                        if summarize(history.events, "running", "RecoverableFailure")["step"] == "bug":
                            return
                        await asyncio.sleep(0.1)
                await asyncio.wait_for(wait_for_bug(), 20)
                self.assertEqual(CALLS, Counter(get_available_task_queue=1, validate=1, extract=1, transform=1))
                await asyncio.sleep(2)  # Delayed attendee tap still resumes promptly.
                # Signals must resume the existing worker, with no deployment or restart.
                with app.test_request_context(f"/recover?job_id={handle.id.removeprefix('datapipeline-')}&workflow_id={handle.id}&run_id={run_id}", method="POST"), patch("ui.app.get_client", AsyncMock(return_value=env.client)):
                    response, status = await recover()
                    self.assertEqual(status, 202, response.json)
                self.assertIn("Successfully processed", await asyncio.wait_for(handle.result(), 10))
                self.assertEqual((await handle.describe()).run_id, run_id)
                self.assertEqual(CALLS, Counter(get_available_task_queue=1, validate=1, extract=1, transform=1, load=1, poll=1))
                history = await handle.fetch_history()
            await Replayer(workflows=[DataPipelineWorkflowScenarios]).replay_workflow(history)
