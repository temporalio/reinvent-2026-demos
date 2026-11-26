"""Capture-first generation and durable recipient handoff, without provider calls."""
from unittest.mock import AsyncMock
import random

import pytest
from fastapi import HTTPException

from holodeck.photobooth import api
from holodeck.photobooth.scenes import BY_ID, FEATURED_SCENE_IDS, PLAYFUL_SCENE_IDS, pick_playful_four, scene_prompt
from holodeck.photobooth.spool import Spool
from holodeck.photobooth.workflows import PhotoBoothInput


def test_playful_pool_varies_all_four_positions():
    pool = set(FEATURED_SCENE_IDS + PLAYFUL_SCENE_IDS)
    assert len(PLAYFUL_SCENE_IDS) == 9
    positions = [set() for _ in range(4)]
    for seed in range(1000):
        ids = pick_playful_four(random.Random(seed))
        assert len(set(ids)) == 4
        assert len({BY_ID[x].category for x in ids}) == 4
        assert ids == pick_playful_four(random.Random(seed))
        for i, sid in enumerate(ids):
            positions[i].add(sid)
    assert all(seen == pool for seen in positions)
    for sid in PLAYFUL_SCENE_IDS:
        prompt = scene_prompt(BY_ID[sid])
        assert 'never horror' in prompt
        assert 'recognizable face visible' in prompt
        assert 'foreground, midground and distant scenery' in prompt


async def test_recipient_survives_restart_and_signal_failure(tmp_path):
    path = tmp_path / 'spool.sqlite'
    spool = Spool(path)
    inp = PhotoBoothInput('aabbccddee', 'test', 'test.jpg', '', wait_for_email=True)
    spool.add('photobooth-test', inp)
    spool.set_recipient(inp.session_id, 'visitor@example.com')
    spool = Spool(path)
    assert spool.get(inp.session_id).input.email == 'visitor@example.com'
    deliver = AsyncMock(side_effect=ConnectionError('offline'))
    await spool.deliver_recipients(deliver)  # Not started: input already contains email.
    deliver.assert_not_called()
    spool.mark_started(inp.session_id)
    with pytest.raises(ConnectionError):
        await spool.deliver_recipients(deliver)
    spool = Spool(path)
    deliver = AsyncMock()
    await spool.deliver_recipients(deliver)
    deliver.assert_awaited_once_with('photobooth-test', 'visitor@example.com')
    spool.set_recipient(inp.session_id, 'visitor@example.com')
    await spool.deliver_recipients(deliver)
    assert deliver.await_count == 1
    with pytest.raises(ValueError):
        spool.set_recipient(inp.session_id, 'another@example.com')


async def test_recipient_api_normalizes_and_persists_before_signalling(tmp_path, monkeypatch):
    spool = Spool(tmp_path / 'spool.sqlite')
    sid = 'aabbccddee'
    spool.add('photobooth-test', PhotoBoothInput(sid, 'test', 'test.jpg', '', wait_for_email=True))
    spool.mark_started(sid)
    monkeypatch.setattr(api, 'spool', spool)
    async def offline(workflow_id, email):
        assert spool.get(sid).input.email == 'visitor+test@example.com'
        raise ConnectionError('offline')
    monkeypatch.setattr(api, 'deliver_recipient', offline)
    result = await api.set_recipient(sid, api.RecipientRequest(email=' Visitor+Test@Example.com '))
    assert result == {'saved': True, 'email': 'visitor+test@example.com'}
    with pytest.raises(HTTPException) as exc:
        await api.set_recipient(sid, api.RecipientRequest(email='other@example.com'))
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException) as exc:
        await api.set_recipient(sid, api.RecipientRequest(email='not-an-address'))
    assert exc.value.status_code == 400


async def test_capture_can_start_without_an_email(tmp_path, monkeypatch):
    from dataclasses import replace
    import base64
    import io
    from PIL import Image
    spool = Spool(tmp_path / 'spool.sqlite')
    monkeypatch.setattr(api, 'spool', spool)
    monkeypatch.setattr(api, 'settings', replace(api.settings, data_dir=tmp_path))
    monkeypatch.setattr(api, 'start_workflow', AsyncMock(return_value='exact-run'))
    monkeypatch.setattr(api, 'resolve_provider_name', lambda: 'mock')
    monkeypatch.setattr(api, 'resolve_analysis_provider', lambda: 'heuristic')
    buf = io.BytesIO()
    Image.new('RGB', (32, 32)).save(buf, 'JPEG')
    image = base64.b64encode(buf.getvalue()).decode()
    result = await api.start_session(api.StartRequest(image=image, wait_for_email=True), 'test')
    row = spool.get(result['session_id'])
    assert row.input.wait_for_email and row.input.email == ''
    assert row.started_at and not result['spooled']
    with pytest.raises(HTTPException) as exc:
        await api.start_session(api.StartRequest(image=image), 'test')
    assert exc.value.status_code == 400
