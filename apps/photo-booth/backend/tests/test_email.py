"""Photo Booth emails use Replay branding and attach the visitor’s strip."""

import base64
import dataclasses
import json
import pytest

import httpx
from temporalio.testing import ActivityEnvironment

from holodeck.shared import email as email_mod
from holodeck.shared.email import EmailMessage, send_email


def _msg(key: str) -> EmailMessage:
    return EmailMessage(to="ben@example.com", subject="hi", html="<p>body</p>", idempotency_key=key)


async def test_outbox_email_has_embedded_logo():
    path = await ActivityEnvironment().run(send_email, _msg("logo-outbox"))
    html = open(path).read()
    assert 'alt="REPLAY"' in html and "data:image/png;base64," in html and "<p>body</p>" in html


async def test_sendgrid_email_attaches_inline_logo(monkeypatch):
    sent: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        sent.update(json.loads(request.content))
        return httpx.Response(202)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(email_mod.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(email_mod, "settings", type("S", (), {**{k: getattr(email_mod.settings, k) for k in ("email_from", "data_dir")},
                                                               "email_provider": "sendgrid", "sendgrid_api_key": "test", "email_from": "booth@temporal.test"})())
    assert await ActivityEnvironment().run(send_email, _msg("logo-sg")) == "sendgrid"
    assert 'src="cid:replay-logo"' in sent["content"][0]["value"]
    att = sent["attachments"][0]
    assert att["content_id"] == "replay-logo" and att["disposition"] == "inline" and att["type"] == "image/png"

async def test_sendgrid_attaches_the_actual_strip(monkeypatch, tmp_path):
    configured = dataclasses.replace(email_mod.settings, data_dir=tmp_path, email_provider="sendgrid", sendgrid_api_key="test", email_from="booth@temporal.test")
    monkeypatch.setattr(email_mod,"settings",configured)
    strip=configured.media_dir / "photobooth/session/strip.jpg"
    strip.parent.mkdir(parents=True); strip.write_bytes(b"sample-jpeg")
    sent={}
    def handler(request):
        sent.update(json.loads(request.content));return httpx.Response(202)
    real=httpx.AsyncClient
    monkeypatch.setattr(email_mod.httpx,"AsyncClient",lambda **kw:real(transport=httpx.MockTransport(handler),**kw))
    msg=_msg("strip-attachment");msg.attachments=["photobooth/session/strip.jpg"]
    assert await ActivityEnvironment().run(send_email,msg)=="sendgrid"
    attachment=next(a for a in sent["attachments"] if a["disposition"]=="attachment")
    assert attachment["filename"]=="strip.jpg" and attachment["type"]=="image/jpeg"
    assert base64.b64decode(attachment["content"])==b"sample-jpeg"

@pytest.mark.parametrize("key",[None,"","TODO"])
async def test_selected_sendgrid_never_silently_becomes_outbox(monkeypatch,key):
    monkeypatch.setattr(email_mod,"settings",dataclasses.replace(email_mod.settings,email_provider="sendgrid",sendgrid_api_key=key))
    with pytest.raises(RuntimeError,match="SENDGRID_API_KEY"):
        await ActivityEnvironment().run(send_email,_msg("missing-key"))

async def test_attachment_cannot_escape_media_directory(monkeypatch,tmp_path):
    monkeypatch.setattr(email_mod,"settings",dataclasses.replace(email_mod.settings,data_dir=tmp_path,email_provider="sendgrid",sendgrid_api_key="test",email_from="booth@temporal.test"))
    msg=_msg("invalid-path");msg.attachments=["../../private.jpg"]
    with pytest.raises(ValueError,match="media directory"):
        await ActivityEnvironment().run(send_email,msg)


def test_photobooth_delivery_matches_replay_layout_and_copy():
    from html import unescape
    from urllib.parse import parse_qs, urlsplit
    from holodeck.photobooth.workflows import _email_html

    body = _email_html()
    rendered = email_mod.branded_html(body, "cid:replay-logo")
    assert "Thanks for joining us in Las Vegas for AWS re:Invent. Next, join us in San Francisco for Temporal's Replay conference May 17-19, 2027" in body
    assert "Your photo strip is attached." in body
    assert "max-width:560px" in rendered
    assert "background-color:#242231" in rendered
    assert "Helvetica, Arial, sans-serif" in rendered
    assert "color:#f47c54" in rendered
    assert "background-color:#2d2b3b" in rendered
    assert "border-radius:20px" in rendered
    for color in ("#f47c54", "#e54e8e", "#f1b84a", "#57a7ba", "#f39a4a"):
        assert f"background-color:{color}" in rendered
    assert 'width="240" height="49"' in rendered
    assert 'alt="REPLAY"' in rendered
    assert "Book your hotel" not in rendered
    assert "Marriott" not in rendered and "Hyatt" not in rendered
    assert "If you have questions about Replay, contact us at" in rendered
    assert 'href="mailto:replay@temporal.io"' in rendered
    assert "{{" not in rendered
    # The attendee image is an attachment, not an external image fetch on open.
    assert "<img" not in body
    import re
    target = unescape(re.search(r'href="(https://replay.temporal.io/[^"]+)"', body).group(1))
    assert parse_qs(urlsplit(target).query) == {
        "utm_source": ["reinvent"], "utm_medium": ["email"],
        "utm_campaign": ["reinvent_2026_photobooth"],
    }
