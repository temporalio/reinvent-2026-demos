"""Verify equal use, station isolation and atomic reservations without providers."""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import random

import pytest

from holodeck.photobooth.rotation import next_strip, scene_concept
from holodeck.photobooth.scenes import BY_ID, CREATURE_SCENE_IDS, RIDE_SCENE_IDS, ROTATION_SCENE_IDS, scene_prompt
from holodeck.photobooth.spool import Spool
from holodeck.photobooth.workflows import PhotoBoothInput


def capture(spool, number, station='2'):
    inp=PhotoBoothInput(f'{station}-{number}',station,'test/photo.jpg','',wait_for_email=True)
    return spool.add('photobooth-'+inp.session_id,inp)


def test_every_cycle_uses_all_24_once_and_separates_rides():
    assert len(ROTATION_SCENE_IDS)==24
    for seed in range(100):
        rng=random.Random(seed)
        state=None
        last=[]
        for cycle in range(10):
            concepts=[]
            for strip_number in range(6):
                selected,state=next_strip(state,rng)
                strip=[scene_concept(sid) for sid in selected]
                assert len(strip)==len(set(strip))==4
                assert sum(sid in RIDE_SCENE_IDS for sid in strip)<=1
                if strip_number==0:
                    assert not set(strip)&set(last)
                concepts.extend(strip)
                last=strip
            assert Counter(concepts)==Counter(ROTATION_SCENE_IDS)


def test_all_creature_species_are_used_before_repeating():
    state=None
    creatures=[]
    for _ in range(72):
        selected,state=next_strip(state,random.Random(len(creatures)+len(state['remaining']) if state else 7))
        creatures.extend(sid for sid in selected if sid in CREATURE_SCENE_IDS)
    assert len(creatures)==12
    assert set(creatures[:6])==set(creatures[6:])==set(CREATURE_SCENE_IDS)
    assert all(a!=b for a,b in zip(creatures,creatures[1:]))


def test_each_booth_survives_restart_with_independent_deck(tmp_path):
    path=tmp_path/'spool.sqlite'
    seen={station:[] for station in ('1','2','3','4')}
    for number in range(6):
        for station in seen:
            # A fresh connection owner on every call simulates service restarts.
            inp=capture(Spool(path),number,station)
            assert Spool(path).get(inp.session_id).input.scene_ids==inp.scene_ids
            seen[station].extend(scene_concept(sid) for sid in inp.scene_ids)
    for ids in seen.values():
        assert Counter(ids)==Counter(ROTATION_SCENE_IDS)


def test_duplicate_capture_does_not_consume_another_strip(tmp_path):
    spool=Spool(tmp_path/'spool.sqlite')
    first=capture(spool,1)
    duplicate=capture(spool,1)
    assert first.scene_ids==duplicate.scene_ids
    rest=[capture(spool,n) for n in range(2,7)]
    assert Counter(scene_concept(sid) for inp in [first,*rest] for sid in inp.scene_ids)==Counter(ROTATION_SCENE_IDS)


def test_concurrent_captures_cannot_draw_the_same_scenes(tmp_path):
    spool=Spool(tmp_path/'spool.sqlite')
    with ThreadPoolExecutor(max_workers=6) as pool:
        inputs=list(pool.map(lambda number:capture(spool,number),range(6)))
    assert Counter(scene_concept(sid) for inp in inputs for sid in inp.scene_ids)==Counter(ROTATION_SCENE_IDS)


def test_failed_capture_write_rolls_back_deck_advance(tmp_path):
    spool=Spool(tmp_path/'spool.sqlite')
    capture(spool,0)
    with spool._conn() as conn:
        before=conn.execute('SELECT state FROM photobooth_scene_decks WHERE station=?',('2',)).fetchone()[0]
        conn.execute("CREATE TRIGGER fail_deck BEFORE UPDATE ON photobooth_scene_decks BEGIN SELECT RAISE(ABORT,'test failure'); END")
    with pytest.raises(Exception,match='test failure'):
        capture(spool,1)
    assert spool.get('2-1') is None
    with spool._conn() as conn:
        assert conn.execute('SELECT state FROM photobooth_scene_decks WHERE station=?',('2',)).fetchone()[0]==before


def test_current_prompts_use_distinct_actions_and_visible_body_poses():
    assert not {'desert_nomad','grand_prix','ice_planet'}&set(ROTATION_SCENE_IDS)
    for sid in (*ROTATION_SCENE_IDS,*CREATURE_SCENE_IDS):
        prompt=scene_prompt(BY_ID[sid])
        assert 'Camera and staging:' in prompt
        assert 'activity must be obvious even with the background hidden' in prompt
        assert 'Keep the face recognizable' in prompt
    for sid in CREATURE_SCENE_IDS:
        assert 'not a dragon, horse or mechanical vehicle' in BY_ID[sid].action


def test_catalog_version_change_starts_a_complete_new_deck():
    selected,state=next_strip({'catalog':'previous','remaining':['old-scene']},random.Random(3))
    assert len(selected)==4 and len(state['remaining'])==20
    assert set(state['remaining'])<=set(ROTATION_SCENE_IDS)


class FakeDynamo:
    def __init__(self):
        import threading
        self.rows={}
        self.lock=threading.Lock()
        self.fail=False

    def get_item(self, TableName, Key, ConsistentRead):
        import copy
        assert ConsistentRead
        with self.lock:
            return {"Item":copy.deepcopy(self.rows[Key['pk']['S']])} if Key['pk']['S'] in self.rows else {}

    def put_item(self, TableName, Item, ConditionExpression, ExpressionAttributeValues=None):
        import copy
        from botocore.exceptions import ClientError
        with self.lock:
            if self.fail:
                raise ConnectionError('offline')
            current=self.rows.get(Item['pk']['S'])
            valid=current is None if ConditionExpression=='attribute_not_exists(pk)' else current and current['revision']==ExpressionAttributeValues[':old']
            if not valid:
                raise ClientError({'Error':{'Code':'ConditionalCheckFailedException'}},'PutItem')
            self.rows[Item['pk']['S']]=copy.deepcopy(Item)


def test_hosted_deck_survives_local_database_replacement(tmp_path):
    from holodeck.photobooth.deck_store import DynamoDecks
    remote=DynamoDecks(FakeDynamo(),'existing-control-table')
    first=Spool(tmp_path/'first.sqlite',remote)
    before=[capture(first,n) for n in range(3)]
    replacement=Spool(tmp_path/'replacement.sqlite',remote)
    assert capture(replacement,0).scene_ids==before[0].scene_ids
    after=[capture(replacement,n) for n in range(3,6)]
    assert Counter(scene_concept(sid) for inp in before+after for sid in inp.scene_ids)==Counter(ROTATION_SCENE_IDS)


def test_hosted_concurrent_reservations_keep_a_complete_cycle():
    from holodeck.photobooth.deck_store import DynamoDecks
    remote=DynamoDecks(FakeDynamo(),'existing-control-table')
    with ThreadPoolExecutor(max_workers=6) as pool:
        strips=list(pool.map(lambda n:remote.reserve('3',str(n)),range(6)))
    assert Counter(scene_concept(sid) for strip in strips for sid in strip)==Counter(ROTATION_SCENE_IDS)


def test_hosted_storage_failure_does_not_silently_use_a_fresh_local_deck(tmp_path):
    from holodeck.photobooth.deck_store import DynamoDecks
    fake=FakeDynamo();fake.fail=True
    spool=Spool(tmp_path/'spool.sqlite',DynamoDecks(fake,'existing-control-table'))
    with pytest.raises(ConnectionError):
        capture(spool,1)
    assert spool.get('2-1') is None
