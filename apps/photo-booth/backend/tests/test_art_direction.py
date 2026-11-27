"""Prompt variety and real render-Activity wiring, with no provider requests."""
import io

import pytest
from PIL import Image
from temporalio.testing import ActivityEnvironment

from holodeck.photobooth import activities
from holodeck.photobooth.art_direction import (
    FIXED_WARDROBES, JUNGLE_ACTIONS, JUNGLE_WORLDS, LIGHTING, OUTFITS, PALETTES,
    direction_for, varied_scene,
)
from holodeck.photobooth.scenes import BY_ID, CREATURE_SCENE_IDS, ROTATION_SCENE_IDS, scene_prompt


def test_four_frames_have_distinct_styling_and_retries_keep_it():
    for n in range(100):
        directions = [direction_for(f'photobooth/capture-{n}', i) for i in range(4)]
        assert directions == [direction_for(f'photobooth/capture-{n}', i) for i in range(4)]
        for field in ('outfit', 'palette', 'lighting'):
            assert len({getattr(d, field) for d in directions}) == 4


def test_repeated_scene_varies_all_art_choices_between_captures():
    directions = [direction_for(f'photobooth/capture-{n}', 0) for n in range(100)]
    for field, pool in (('outfit', OUTFITS), ('palette', PALETTES), ('lighting', LIGHTING),
                        ('jungle_action', JUNGLE_ACTIONS), ('jungle_world', JUNGLE_WORLDS)):
        assert {getattr(d, field) for d in directions} == set(pool)


def test_jungle_actions_and_staging_agree_in_actual_prompt():
    prompts = set()
    for n in range(100):
        key = f'photobooth/capture-{n}'
        direction = direction_for(key, 0)
        prompt = scene_prompt(BY_ID['jungle_ranger'], capture_key=key)
        assert direction.jungle_action[0] in prompt
        assert direction.jungle_action[1] in prompt
        assert direction.jungle_world in prompt
        if 'swinging' not in direction.jungle_action[0]:
            assert 'on a vine' not in prompt
        prompts.add(prompt)
    assert len(prompts) > 90


def test_all_active_scenes_replace_fixed_clothing_without_mutating_catalog():
    for sid in (*ROTATION_SCENE_IDS, *CREATURE_SCENE_IDS):
        original = BY_ID[sid]
        varied, _ = varied_scene(original, 'photobooth/capture-10', 1)
        assert varied is not original
        assert BY_ID[sid] is original
        assert varied.id == original.id
        assert all(fixed not in varied.action for fixed in FIXED_WARDROBES)
        prompt = scene_prompt(original, capture_key='photobooth/capture-10', frame_index=1)
        assert 'Capture-specific wardrobe:' in prompt
        assert 'Environment art direction:' in prompt
        assert 'replace reference clothing, hats and gloves' in prompt
        assert 'keep the entire face clearly visible' in prompt


@pytest.mark.parametrize('style,soft', [('inspired', False), ('photo', False), ('inspired', True)])
def test_styling_survives_edit_style_and_soft_retry(style, soft):
    prompt = scene_prompt(BY_ID['starfighter_ace'], face_count=2, style=style, soft=soft,
                          capture_key='photobooth/capture-10', frame_index=2)
    assert 'Capture-specific wardrobe:' in prompt
    assert 'Environment art direction:' in prompt
    assert 'all crew members remain recognizable' in prompt


@pytest.mark.asyncio
async def test_render_activity_sends_capture_and_frame_specific_prompt(monkeypatch, tmp_path):
    prompts = []

    class Provider:
        name = 'fake'

        def render_scene(self, photo, scene, prompt, analysis):
            prompts.append(prompt)
            out = io.BytesIO()
            Image.new('RGB', (800, 600), 'green').save(out, 'JPEG')
            return out.getvalue()

    monkeypatch.setattr(activities, 'get_provider', lambda _: Provider())
    monkeypatch.setattr(activities, 'media_path', lambda relative: tmp_path / relative)
    (tmp_path / 'capture').mkdir()
    (tmp_path / 'photo.jpg').write_bytes(b'synthetic-reference')
    inp = activities.RenderSceneInput('capture', 2, 'jungle_ranger', 'photo.jpg', 'fake')
    env = ActivityEnvironment()
    await env.run(activities.render_scene, inp)
    await env.run(activities.render_scene, inp)
    assert prompts[0] == prompts[1]
    direction = direction_for('capture', 2)
    assert direction.palette[0] in prompts[0]
    assert direction.jungle_action[0] in prompts[0]
    assert (tmp_path / 'capture' / 'frame-2.jpg').is_file()
