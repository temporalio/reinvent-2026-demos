"""Full HD pixels survive frame normalization, composition and email attachment."""
import base64
import dataclasses
import io
import json

import httpx
import pytest
from PIL import Image, ImageDraw
from temporalio.testing import ActivityEnvironment

from holodeck.photobooth import activities
from holodeck.photobooth.providers import fit_frame
from holodeck.shared import email as email_mod


def test_native_frame_is_trimmed_not_scaled():
    native = Image.new('RGB', (1920, 1088), 'black')
    draw = ImageDraw.Draw(native)
    # Single-pixel texture at both horizontal edges detects cropping or resizing.
    for x in range(1920):
        draw.line((x, 4, x, 1083), fill=(x % 256, 100, 200))
    source = io.BytesIO()
    native.save(source, 'PNG')
    frame = fit_frame(source.getvalue())
    assert frame.size == (1920, 1080)
    assert frame.tobytes() == native.crop((0, 4, 1920, 1084)).tobytes()


@pytest.fixture
def full_hd_input(monkeypatch, tmp_path):
    monkeypatch.setattr(activities, 'media_path', lambda relative: tmp_path / relative)
    (tmp_path / 'session').mkdir()
    paths = []
    colors = [(220, 20, 30), (20, 200, 30), (30, 20, 220), (210, 160, 30)]
    for i, color in enumerate(colors):
        path = f'frame-{i}.png'
        Image.new('RGB', (1920, 1080), color).save(tmp_path / path)
        paths.append(path)
    return activities.ComposeInput('session', paths, 'TEMPORAL HOLODECK', 'NOV 26, 2026'), tmp_path, colors


@pytest.mark.asyncio
async def test_four_frames_keep_order_pixels_and_borders(full_hd_input):
    inp, root, colors = full_hd_input
    result = await ActivityEnvironment().run(activities.compose_strip, inp)
    with Image.open(root / result.path.lstrip('/')) as strip:
        assert strip.size == (2060, 4700)
        for i, expected in enumerate(colors):
            actual = strip.getpixel((1000, 36 + i * 1116 + 540))
            assert all(abs(a - b) <= 3 for a, b in zip(actual, expected))
        assert strip.getpixel((50, 110)) == activities.STRIP_BG
        assert strip.getpixel((1000, 1125)) == activities.STRIP_BG
        footer = strip.crop((70, 4500, 1990, 4700))
        assert len(footer.getcolors(1_000_000)) > 50  # logo and footer are rendered


@pytest.mark.asyncio
async def test_preview_uses_small_canvases_and_leaves_hd_frames_intact(full_hd_input, monkeypatch):
    inp, root, _ = full_hd_input
    sizes = []
    original = activities._strip_canvas

    def canvas(n, frame_size=(1920, 1080)):
        sizes.append(frame_size)
        return original(n, frame_size)

    monkeypatch.setattr(activities, '_strip_canvas', canvas)
    result = await ActivityEnvironment().run(activities.make_animated_strip, inp)
    with Image.open(root / result.path.lstrip('/')) as preview:
        assert preview.size == (470, 1090)
        assert preview.n_frames > 1
    assert sizes == [(800, 450)] * 10
    for path in inp.frame_paths:
        with Image.open(root / path) as frame:
            assert frame.size == (1920, 1080)


@pytest.mark.asyncio
async def test_sendgrid_receives_full_resolution_strip(full_hd_input, monkeypatch):
    inp, root, _ = full_hd_input
    result = await ActivityEnvironment().run(activities.compose_strip, inp)
    payload = {}

    def handler(request):
        payload.update(json.loads(request.content))
        return httpx.Response(202)

    real = httpx.AsyncClient
    monkeypatch.setattr(email_mod.httpx, 'AsyncClient', lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(email_mod, 'settings', dataclasses.replace(email_mod.settings, data_dir=root,
                        email_provider='sendgrid', sendgrid_api_key='synthetic-test', email_from='booth@temporal.test'))
    # The email activity resolves attachments under media_dir; redirect that for this fixture.
    media = email_mod.settings.media_dir
    media.mkdir(parents=True, exist_ok=True)
    (media / 'strip.jpg').write_bytes((root / result.path.lstrip('/')).read_bytes())
    msg = email_mod.EmailMessage('visitor@example.test', 'Photo strip', '<p>Attached</p>', 'hd-strip', ['strip.jpg'])
    await ActivityEnvironment().run(email_mod.send_email, msg)
    attachment = next(a for a in payload['attachments'] if a['disposition'] == 'attachment')
    with Image.open(io.BytesIO(base64.b64decode(attachment['content']))) as strip:
        assert strip.size == (2060, 4700)
    assert 'href="https://temporal.io/"' in payload['content'][0]['value']


@pytest.mark.asyncio
async def test_public_output_dimensions_match_delivery_contract():
    from fastapi import FastAPI
    from holodeck.photobooth.api import router
    app = FastAPI()
    app.include_router(router, prefix="/api")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://test') as client:
        response = await client.get('/api/photobooth/capabilities')
    assert response.status_code == 200
    assert response.json() == {
        'frame': {'width': 1920, 'height': 1080},
        'strip': {'width': 2060, 'height': 4700},
        'animated_preview': {'width': 470, 'height': 1090},
    }
