"""New flight IDs preserve access to the same station's pre-migration games."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from temporalio.service import RPCError, RPCStatusCode

from holodeck.flight import api


@pytest.fixture(autouse=True)
def empty_cache():
    api._session_workflows.clear()
    yield
    api._session_workflows.clear()


async def test_new_session_id_keeps_demo_and_station():
    handle = SimpleNamespace(id='flightsim-mac1-abc', describe=AsyncMock())
    client = SimpleNamespace(get_workflow_handle=lambda value: handle if value == handle.id else None)
    assert (await api._session_handle(client, 'abc', 'mac1')).id == 'flightsim-mac1-abc'
    assert (await api._session_handle(client, 'abc', 'mac1')).id == 'flightsim-mac1-abc'
    assert handle.describe.await_count == 1


async def test_old_session_lookup_cannot_cross_stations():
    seen = []
    def get_handle(value):
        seen.append(value)
        return SimpleNamespace(id=value, describe=AsyncMock(side_effect=RPCError('missing', RPCStatusCode.NOT_FOUND, b'')))
    client = SimpleNamespace(get_workflow_handle=get_handle)
    handle = await api._session_handle(client, 'abc', 'mac2')
    assert handle.id == 'holodeck-mac2-flight-abc'
    assert all('mac1' not in value for value in seen)
