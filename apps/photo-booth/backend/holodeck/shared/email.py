"""Email activity: SendGrid in production, a local outbox folder otherwise.

Every Photo Booth message uses the Replay email wrapper and inline wordmark.
"""

from __future__ import annotations

import base64
import html
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from temporalio import activity

from ..config import settings

OUTBOX = settings.data_dir / "outbox"
LOGO_PNG = Path(__file__).parent / "assets" / "replay-logo.png"
REPLAY_TEMPLATE = Path(__file__).with_name("replay_email.html")
LOGO_CID = "replay-logo"
# Public URL for the logo once assets are hosted (S3/CloudFront). Most
# reliable across mail clients; otherwise SendGrid sends it as an inline
# attachment and the local outbox embeds it.
LOGO_URL = os.getenv("HOLODECK_EMAIL_LOGO_URL") or None


@dataclass
class EmailMessage:
    to: str
    subject: str
    html: str
    # Stable key so a retried send is recognisable (SendGrid custom arg / outbox filename).
    idempotency_key: str
    attachments: list[str] = field(default_factory=list)  # paths under media_dir


def branded_html(body: str, logo_src: str, subject: str = "Temporal Photo Booth") -> str:
    """Use Replay’s HTML branding with Photo Booth content and its own contact footer."""
    return (REPLAY_TEMPLATE.read_text()
            .replace("{{ subject }}", html.escape(subject))
            .replace("{{ logo_src }}", html.escape(logo_src, quote=True))
            .replace("{{ content }}", body)
            .replace("{{ footer }}", '<p style="margin:0 0 8px;color:#aaa397;font-family:Helvetica, Arial, sans-serif;font-size:12px;line-height:1.6;">If you have questions about Replay, contact us at <a href="mailto:replay@temporal.io" style="color:#f47c54;text-decoration:underline;">replay@temporal.io</a>.</p><p style="margin:0;color:#aaa397;font-family:Helvetica, Arial, sans-serif;font-size:12px;line-height:1.6;"><a href="https://temporal.io/" style="color:#f47c54;text-decoration:underline;">Visit temporal.io</a></p>'))


def _logo_b64() -> str:
    return base64.b64encode(LOGO_PNG.read_bytes()).decode()


@activity.defn
async def send_email(msg: EmailMessage) -> str:
    if settings.email_provider == "sendgrid":
        if not settings.sendgrid_api_key or settings.sendgrid_api_key.strip().lower() in {"todo", "changeme", "set-me"}:
            raise RuntimeError("SendGrid is selected but SENDGRID_API_KEY is not configured on this worker")
        sender = settings.email_from.strip()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", sender) or sender.lower().endswith("@example.com"):
            raise RuntimeError("Set HOLODECK_EMAIL_FROM to a verified SendGrid sender")
        payload: dict = {
            "personalizations": [{"to": [{"email": msg.to}]}],
            "from": {"email": settings.email_from, "name": "Temporal Holodeck"},
            "subject": msg.subject,
            "content": [{"type": "text/html", "value": branded_html(msg.html, LOGO_URL or f"cid:{LOGO_CID}", msg.subject)}],
            "custom_args": {"idempotency_key": msg.idempotency_key},
        }
        if not LOGO_URL:
            payload["attachments"] = [{
                "content": _logo_b64(), "type": "image/png", "filename": "replay-logo.png",
                "disposition": "inline", "content_id": LOGO_CID,
            }]
        for relative in msg.attachments:
            root = settings.media_dir.resolve()
            path = (root / relative).resolve()
            if not path.is_relative_to(root):
                raise ValueError("Email attachment must be under the photo media directory")
            mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif"}.get(path.suffix.lower())
            if not mime:
                raise ValueError("Unsupported photo attachment type")
            payload.setdefault("attachments", []).append({
                "content": base64.b64encode(path.read_bytes()).decode(), "type": mime,
                "filename": path.name, "disposition": "attachment",
            })
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {settings.sendgrid_api_key}"},
                json=payload,
            )
            r.raise_for_status()
        return "sendgrid"

    if settings.email_provider != "outbox":
        raise RuntimeError("Unsupported email provider; choose sendgrid or outbox")
    OUTBOX.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w.-]", "_", msg.idempotency_key)
    path = OUTBOX / f"{safe}.html"
    html = branded_html(msg.html, LOGO_URL or f"data:image/png;base64,{_logo_b64()}", msg.subject)
    path.write_text(f"<!-- to: {msg.to} | subject: {msg.subject} -->\n{html}")
    activity.logger.info("Email written to outbox: %s", path)
    return str(path)
