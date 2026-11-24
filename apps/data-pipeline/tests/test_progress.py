"""Exercise recorded progress and closed-job controls without a Cloud connection."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from temporalio.api.history.v1 import HistoryEvent
from ui.progress import summarize
from ui.app import app, get_progress, signal, manifest, temporal_workflow_url, request_workflow_id


def scheduled(event_id, name):
    return HistoryEvent(event_id=event_id, activity_task_scheduled_event_attributes={"activity_type": {"name": name}})


def completed(event_id, scheduled_id):
    return HistoryEvent(event_id=event_id, activity_task_completed_event_attributes={"scheduled_event_id": scheduled_id})


class ProgressTests(unittest.TestCase):
    def test_file_and_workflow_metadata(self):
        self.assertEqual(manifest()['objects'], 8)
        with patch.dict('os.environ', {'TEMPORAL_UI_URL': 'http://localhost:15101/_temporal/primary', 'TEMPORAL_UI_NAMESPACE': 'default'}):
            self.assertEqual(temporal_workflow_url('job-1', 'run-2'), '/_temporal/primary/namespaces/default/workflows/job-1/run-2/timeline')

    def test_new_and_legacy_job_ids_cannot_select_another_job(self):
        with app.test_request_context('/get_progress?job_id=abc&workflow_id=datapipeline-abc'):
            self.assertEqual(request_workflow_id('abc'), 'datapipeline-abc')
        with app.test_request_context('/get_progress?job_id=abc'):
            self.assertEqual(request_workflow_id('abc'), 'job-abc')
        from werkzeug.exceptions import BadRequest
        with app.test_request_context('/get_progress?job_id=abc&workflow_id=datapipeline-other'):
            with self.assertRaises(BadRequest):
                request_workflow_id('abc')

    def test_wait_and_failure_retain_recorded_work(self):
        events = [scheduled(1, 'transform'), completed(2, 1), scheduled(3, 'load'), completed(4, 3)]
        waiting = summarize(events, 'running', 'HumanInLoopSignal')
        self.assertEqual((waiting['step'], waiting['status']), ('signal', 'waiting'))
        self.assertTrue(waiting['transformed'])
        failed = summarize(events, 'failed', 'HumanInLoopSignal')
        self.assertEqual(failed['status'], 'failed')
        self.assertEqual(failed['completed_activities'], 2)
        self.assertIn('Start another shipment', failed['events'][-1]['text'])
        done = summarize(events, 'completed', 'HappyPath')
        self.assertEqual(done['progress'], 100)


class ClosedJobTests(unittest.IsolatedAsyncioTestCase):
    async def test_expired_signal_returns_actionable_conflict(self):
        handle = SimpleNamespace(describe=AsyncMock(return_value=SimpleNamespace(status=SimpleNamespace(name='FAILED'))), signal=AsyncMock())
        client = SimpleNamespace(get_workflow_handle=lambda *a, **kw: handle)
        with app.test_request_context('/signal?job_id=1&run_id=run-2'), patch('ui.app.get_client', AsyncMock(return_value=client)):
            response, status = await signal()
            self.assertEqual(status, 409)
            self.assertIn('Start another shipment', response.json['error'])
            handle.signal.assert_not_awaited()
