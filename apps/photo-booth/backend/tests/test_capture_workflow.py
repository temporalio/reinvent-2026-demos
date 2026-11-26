"""Run capture-first ordering against an isolated Temporal server, with fake Activities.

Set TEST_TEMPORAL_ADDRESS to the test server; no image or email provider is used.
"""
import asyncio
import os
import uuid
from datetime import timedelta

import pytest
from temporalio import activity
from temporalio.client import Client
from temporalio.worker import Worker, Replayer
from temporalio.testing import WorkflowEnvironment

from holodeck.photobooth.activities import AnalyzeInput, RenderSceneInput, RenderResult, ComposeInput, ImageResult
from holodeck.photobooth.analysis import PhotoAnalysis
from holodeck.photobooth.workflows import PhotoBoothWorkflow, PhotoBoothInput
from holodeck.shared.email import EmailMessage
from holodeck.shared.leads import Lead

@pytest.fixture
async def temporal_client():
    if os.getenv('TEST_TEMPORAL_ADDRESS'):
        yield await Client.connect(os.environ['TEST_TEMPORAL_ADDRESS'])
    elif os.getenv('TEST_TEMPORAL_BINARY'):
        async with await WorkflowEnvironment.start_local(dev_server_existing_path=os.environ['TEST_TEMPORAL_BINARY']) as env:
            yield env.client
    else:
        pytest.skip('isolated Temporal server required')


@pytest.mark.parametrize('email_first', [False, True])
async def test_rendering_and_recipient_join_before_delivery(email_first, temporal_client):
    calls = []
    gate = asyncio.Event()

    @activity.defn(name='analyze_photo')
    async def analyze(inp: AnalyzeInput) -> PhotoAnalysis:
        return PhotoAnalysis()

    @activity.defn(name='render_scene')
    async def render(inp: RenderSceneInput) -> RenderResult:
        calls.append('render')
        await gate.wait()
        return RenderResult(f'frame{inp.index}.jpg', f'/media/frame{inp.index}.jpg', 'mock')

    @activity.defn(name='compose_strip')
    async def compose(inp: ComposeInput) -> ImageResult:
        calls.append('compose')
        return ImageResult('strip.jpg', '/media/strip.jpg')

    @activity.defn(name='make_animated_strip')
    async def animate(inp: ComposeInput) -> ImageResult:
        return ImageResult('strip.gif', '/media/strip.gif')

    @activity.defn(name='save_lead')
    async def lead(inp: Lead) -> str:
        calls.append(('lead', inp.email))
        return inp.id

    @activity.defn(name='send_email')
    async def email(inp: EmailMessage) -> str:
        calls.append(('email', inp.to, inp.attachments))
        return 'mock-sent'

    async def until(predicate):
        async with asyncio.timeout(15):
            while not await predicate():
                await asyncio.sleep(.05)

    client = temporal_client
    sid = uuid.uuid4().hex[:10]
    queue = 'capture-test-' + sid
    inp = PhotoBoothInput(sid, 'test', 'capture/photo.jpg', '', wait_for_email=True)
    async with Worker(client, task_queue=queue, workflows=[PhotoBoothWorkflow],
                      activities=[analyze, render, compose, animate, lead, email]):
        handle = await client.start_workflow(PhotoBoothWorkflow.run, inp, id='photobooth-'+sid, task_queue=queue)
        async def renders_started():
            return calls.count('render') == 4
        await until(renders_started)
        assert not any(isinstance(x, tuple) for x in calls)
        if email_first:
            await handle.signal(PhotoBoothWorkflow.set_recipient, 'visitor@example.com')
        gate.set()
        if not email_first:
            async def waiting():
                return (await handle.query(PhotoBoothWorkflow.status)).stage == 'awaiting_email'
            await until(waiting)
            assert 'compose' in calls
            assert not any(isinstance(x, tuple) for x in calls)
            await handle.signal(PhotoBoothWorkflow.set_recipient, 'visitor@example.com')
        result = await handle.result(rpc_timeout=timedelta(seconds=15))
        assert result.stage == 'done'
        assert result.email == 'visitor@example.com'
        assert calls[-2:] == [('lead', 'visitor@example.com'), ('email', 'visitor@example.com', ['strip.jpg'])]
        await Replayer(workflows=[PhotoBoothWorkflow]).replay_workflow(await handle.fetch_history())
