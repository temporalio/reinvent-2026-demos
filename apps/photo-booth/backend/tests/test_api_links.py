"""Workflow inspection links keep the exact execution after completion."""
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from holodeck.config import settings
from holodeck import temporal_client
from holodeck.photobooth import api
from holodeck.photobooth.workflows import PhotoBoothStatus


@pytest.mark.parametrize("stage", ["processing", "done"])
async def test_session_links_to_described_run(monkeypatch, stage):
    sid = "a0b69032bf"
    workflow_id = f"holodeck-laptop-photobooth-{sid}"
    row = SimpleNamespace(
        workflow_id=workflow_id, started_at="2026-11-23", input=SimpleNamespace(email="test@example.com")
    )
    desc = SimpleNamespace(
        run_id="exact-run-id", status=SimpleNamespace(name="COMPLETED" if stage == "done" else "RUNNING"),
        raw_description=SimpleNamespace(pending_activities=[]),
    )
    handle = SimpleNamespace(
        query=AsyncMock(return_value=PhotoBoothStatus(session_id=sid, stage=stage)),
        describe=AsyncMock(return_value=desc),
    )
    monkeypatch.setattr(api.spool, "get", lambda _: row)
    monkeypatch.setattr(api, "get_client", AsyncMock(return_value=SimpleNamespace(get_workflow_handle=lambda _: handle)))
    monkeypatch.setattr(temporal_client, "settings", replace(
        settings, temporal_ui_url="https://booth.example/_temporal/primary",
        temporal_ui_namespace="fieldkit-reinvent-2026.a2dd6",
    ))
    result = await api.get_session(sid)
    assert result["temporal_ui_url"] == (
        "https://booth.example/_temporal/primary/namespaces/fieldkit-reinvent-2026.a2dd6/"
        f"workflows/{workflow_id}/exact-run-id/timeline"
    )
