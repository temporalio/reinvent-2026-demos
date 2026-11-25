"""Two people, and two crashable workspaces, sharing one namespace can't see each other's agents.

No worker runs here: every check happens before the API would ask an agent anything, and a
session is just a started workflow that Visibility can list.
"""

import asyncio
import uuid

import httpx
import pytest
import pytest_asyncio

from temporal_agent_harness.plugin import AgentHarnessPlugin

from agent_harness_demo import config, web
from tests.temporal_env import start_workflow_environment

CHAT_AGENT = "ZiggyChatAgent"


@pytest_asyncio.fixture(scope="module")
async def temporal():
    env = await start_workflow_environment(plugins=[AgentHarnessPlugin()])
    yield env.client
    await env.shutdown()


@pytest.fixture
def api(temporal, monkeypatch):
    """Returns a factory for API clients bound to one task queue (one workspace)."""
    monkeypatch.setattr(web, "TRUST_AUTH_HEADERS", True)

    def for_queue(task_queue: str):
        monkeypatch.setattr(config, "TASK_QUEUE", task_queue)
        app = web.create_app()
        app.state.temporal = temporal

        def as_user(subject: str | None) -> httpx.AsyncClient:
            headers = {web.AUTH_SUBJECT_HEADER: subject} if subject else {}
            transport = httpx.ASGITransport(app=app)
            return httpx.AsyncClient(transport=transport, base_url="http://test", headers=headers)

        return as_user

    return for_queue


async def listed_ids(client: httpx.AsyncClient) -> set[str]:
    response = await client.get("/api/sessions")
    response.raise_for_status()
    return {session["workflow_id"] for session in response.json()}


async def eventually_listed(client: httpx.AsyncClient, workflow_id: str) -> set[str]:
    """Visibility is eventually consistent, so wait for the caller's own session to appear."""
    for _ in range(50):
        ids = await listed_ids(client)
        if workflow_id in ids:
            return ids
        await asyncio.sleep(0.1)
    raise AssertionError(f"{workflow_id} never appeared in its owner's list")


async def test_people_see_and_control_only_their_own_sessions(api):
    as_user = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with as_user("alice") as alice, as_user("bob") as bob:
        created = await alice.post("/api/sessions", json={"agent_workflow_type": CHAT_AGENT})
        created.raise_for_status()
        session_id = created.json()["workflow_id"]

        await eventually_listed(alice, session_id)
        assert session_id not in await listed_ids(bob)

        attempts = [
            bob.get(f"/api/status/{session_id}"),
            bob.get(f"/api/workflow-status/{session_id}"),
            bob.get(f"/api/agent-interface/{session_id}"),
            bob.get("/api/attach", params={"session_id": session_id}),
            bob.post(f"/api/sessions/{session_id}/close"),
            bob.post("/api/messages", json={"session_id": session_id, "message": "hi"}),
            bob.post("/api/chat", json={"session_id": session_id, "message": "hi"}),
            bob.post(
                "/api/approve",
                json={"session_id": session_id, "tool_id": "t", "approved": True},
            ),
        ]
        for response in await asyncio.gather(*attempts):
            assert response.status_code == 404, response.request.url


async def test_a_chosen_session_id_stays_inside_the_callers_prefix(api):
    as_user = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with as_user("alice") as alice, as_user("bob") as bob:
        mine = await alice.post(
            "/api/sessions", json={"agent_workflow_type": CHAT_AGENT, "session_id": "trip"}
        )
        theirs = await bob.post(
            "/api/sessions", json={"agent_workflow_type": CHAT_AGENT, "session_id": "trip"}
        )
        assert mine.json()["workflow_id"] != theirs.json()["workflow_id"]


async def test_workspaces_on_other_task_queues_are_invisible(api):
    # One workspace at a time: each deployment process has exactly one task queue.
    workspace_a = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with workspace_a("alice") as in_a:
        created = await in_a.post("/api/sessions", json={"agent_workflow_type": CHAT_AGENT})
        session_id = created.json()["workflow_id"]
        await eventually_listed(in_a, session_id)
    workspace_b = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with workspace_b("alice") as in_b:
        assert session_id not in await listed_ids(in_b)
        assert (await in_b.get(f"/api/status/{session_id}")).status_code == 404


async def test_requests_without_a_signed_in_subject_are_refused(api):
    as_user = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with as_user(None) as anonymous:
        assert (await anonymous.get("/api/sessions")).status_code == 401
        assert (await anonymous.get("/api/health")).status_code == 200


async def test_the_demo_view_can_name_its_session_before_creating_it(api):
    as_user = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with as_user("alice") as alice, as_user("bob") as bob:
        prefix = (await alice.get("/api/view")).json()["session_prefix"]
        chosen = {"agent_workflow_type": CHAT_AGENT, "session_id": prefix + "trip-1"}
        created = await alice.post("/api/sessions", json=chosen)
        assert created.json()["workflow_id"] == prefix + "trip-1"
        assert (await alice.post("/api/sessions", json=chosen)).status_code == 409
        # Another person can't name an ID inside alice's prefix.
        theirs = await bob.post("/api/sessions", json=chosen)
        assert theirs.status_code == 422


async def test_the_console_reaches_the_same_scoped_api(api):
    as_user = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with as_user("alice") as alice, as_user("bob") as bob:
        created = await alice.post("/console/api/sessions", json={"agent_workflow_type": CHAT_AGENT})
        session_id = created.json()["workflow_id"]
        await eventually_listed(alice, session_id)
        assert (await bob.get(f"/console/api/status/{session_id}")).status_code == 404
        page = await alice.get("/console/")
        assert page.status_code == 200 and "demo-view-link" in page.text


async def test_a_session_starts_with_the_travelers_date_or_is_refused(api):
    as_user = api(f"agent-harness-{uuid.uuid4().hex[:8]}")
    async with as_user("alice") as alice:
        good = {"today": "2026-12-01", "timezone": "Europe/Zurich"}
        started = await alice.post("/api/sessions", json={"agent_workflow_type": CHAT_AGENT, "data": good})
        assert started.status_code == 200
        bad = {"today": "December 1st"}
        refused = await alice.post("/api/sessions", json={"agent_workflow_type": CHAT_AGENT, "data": bad})
        assert refused.status_code == 422


async def test_booth_stations_cannot_list_stream_or_approve_each_others_trips(api, monkeypatch):
    monkeypatch.setattr(web, "BOOTH_STATION_SCOPING", True)
    as_user = api(f"booth-travel-{uuid.uuid4().hex[:8]}")
    async with as_user("booth-staff") as one, as_user("booth-staff") as two:
        one.headers["X-Booth-Station"] = "1"
        two.headers["X-Booth-Station"] = "2"
        created = await one.post("/api/sessions", json={"agent_workflow_type": CHAT_AGENT,
            "data": {"today": "2026-12-01", "traveler_name": "Alex Morgan",
                     "origin_city": "Las Vegas (LAS)", "destination_city": "Seattle (SEA)"}})
        created.raise_for_status()
        session_id = created.json()["workflow_id"]
        await eventually_listed(one, session_id)
        assert session_id not in await listed_ids(two)
        assert (await two.get("/api/attach", params={"session_id": session_id})).status_code == 404
        assert (await two.post("/api/approve", json={"session_id": session_id, "tool_id": "t", "approved": True})).status_code == 404
        listing = await one.get("/api/sessions")
        item = next(row for row in listing.json() if row["workflow_id"] == session_id)
        assert item["plan"]["traveler_name"] == "Alex Morgan"


async def test_booth_requires_a_valid_station_and_console_remembers_it(api, monkeypatch):
    monkeypatch.setattr(web, "BOOTH_STATION_SCOPING", True)
    as_user = api(f"booth-travel-{uuid.uuid4().hex[:8]}")
    async with as_user("booth-staff") as client:
        assert (await client.get("/api/view")).status_code == 400
        assert (await client.get("/api/view?station=5")).status_code == 400
        response = await client.get("/api/view?station=3")
        assert response.status_code == 200
        assert "reinvent_travel_station=3" in response.headers["set-cookie"]
        # httpx's test base path is /, whereas production is /travel-agent/.
        client.cookies.set(web.STATION_COOKIE, "3", path="/")
        assert (await client.get("/console/api/sessions")).status_code == 200


async def test_ended_trips_remain_in_the_station_history(api, temporal, monkeypatch):
    monkeypatch.setattr(web, "BOOTH_STATION_SCOPING", True)
    as_user = api(f"booth-history-{uuid.uuid4().hex[:8]}")
    async with as_user("booth-staff") as client:
        client.headers["X-Booth-Station"] = "4"
        response = await client.post("/api/sessions", json={"agent_workflow_type": CHAT_AGENT})
        response.raise_for_status()
        workflow_id = response.json()["workflow_id"]
        await temporal.get_workflow_handle(workflow_id).terminate(reason="Station history test")
        for _ in range(50):
            rows = (await client.get("/api/sessions")).json()
            if any(row["workflow_id"] == workflow_id and row["closed"] for row in rows):
                break
            await asyncio.sleep(.1)
        else:
            raise AssertionError("The ended trip disappeared from its station history")


async def test_all_four_station_prefixes_are_distinct(api, monkeypatch):
    monkeypatch.setattr(web, "BOOTH_STATION_SCOPING", True)
    as_user = api(f"booth-four-{uuid.uuid4().hex[:8]}")
    prefixes = set()
    async with as_user("booth-staff") as client:
        for station in ("1", "2", "3", "4"):
            response = await client.get("/api/view", headers={"X-Booth-Station": station})
            response.raise_for_status()
            prefixes.add(response.json()["session_prefix"])
    assert len(prefixes) == 4
