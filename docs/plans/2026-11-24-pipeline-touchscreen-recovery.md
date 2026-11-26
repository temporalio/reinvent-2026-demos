# Pipeline Touchscreen Recovery

The RecoverableFailure scenario pauses at a durable simulated-code-bug checkpoint after transformation. A **Fix code and resume** button sends a durable `demo_fix_code` Signal to the exact running job and Run ID. The Signal enables a prewritten corrected branch, so the same worker can continue that run without repeating completed Activities.

This simulates deploying a code fix. The UI and runbook say so explicitly. There is no browser-triggered source edit, worker restart, deployment, Workflow reset, or replacement run. The endpoint rejects other scenarios, runs that have not reached the checkpoint, and closed runs. Recorded recovery Signals suppress repeated requests; the handler is idempotent.

The event log, lower code panel, and architecture panel follow the recorded recovery Signal and subsequent Activities. Existing failed-task history and Activity command order are preserved. New runs use an untimed wait condition so failed-task retry backoff cannot delay the attendee's recovery tap.

Validation: Docker integration test observes the recovery checkpoint on a real Temporal server, calls the recovery endpoint, verifies the unchanged Run ID and one execution of every Activity, then replays the completed history. Unit tests cover request guards and repeated requests. CI uses a test-only Temporal CLI image stage; production images retain no extra recovery service or CLI.
