"""The kitchen's ready Signal must follow the order across the ID migration."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from temporalio.service import RPCError, RPCStatusCode

from dejavu_tacos import config
from dejavu_tacos.api import routes
from dejavu_tacos.models import ArchitectureMode


@pytest.mark.asyncio
@pytest.mark.parametrize('legacy', [False, True])
async def test_ready_signal_uses_new_id_and_retains_legacy_orders(monkeypatch, legacy):
    seen = []
    def get_handle(value):
        seen.append(value)
        failure = RPCError('missing', RPCStatusCode.NOT_FOUND, b'') if legacy and value.startswith('spacetacos-') else None
        return SimpleNamespace(signal=AsyncMock(side_effect=failure))
    client = SimpleNamespace(get_workflow_handle=get_handle)
    monkeypatch.setattr(routes, 'get_temporal_client', AsyncMock(return_value=client))
    monkeypatch.setattr(routes, 'emit_event', AsyncMock())
    monkeypatch.setattr(config, 'store_orders', {'abc': {}})
    monkeypatch.setattr(config.settings, 'mode', ArchitectureMode.TEMPORAL)
    assert (await routes.mark_order_ready('abc'))['status'] == 'signaled'
    assert seen == (['spacetacos-abc', 'order-abc'] if legacy else ['spacetacos-abc'])
