"""The image edit sends input_fidelity only when it is configured."""

import base64
import dataclasses

from holodeck.photobooth import providers
from holodeck.photobooth.scenes import SCENES
from holodeck.config import settings


class FakeImages:
    def __init__(self) -> None:
        self.kwargs: dict = {}

    def edit(self, **kwargs):
        self.kwargs = kwargs

        class Item:
            b64_json = base64.b64encode(b"jpeg").decode()

        class Res:
            data = [Item()]

        return Res()


def render(fidelity: str | None) -> dict:
    p = providers.OpenAIImageProvider.__new__(providers.OpenAIImageProvider)
    p._s = dataclasses.replace(settings, openai_input_fidelity=fidelity)
    images = FakeImages()
    p._client = type("C", (), {"images": images})()
    p.render_scene(b"photo", SCENES[0], "a prompt", None)
    return images.kwargs


def test_default_omits_input_fidelity():
    # OpenAI rejects it for gpt-image-2.5-flare and documents it only for older models.
    assert settings.openai_input_fidelity is None
    assert "input_fidelity" not in render(None)


def test_configured_input_fidelity_is_sent():
    assert render("high")["input_fidelity"] == "high"
