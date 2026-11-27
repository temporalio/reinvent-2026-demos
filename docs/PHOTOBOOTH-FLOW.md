# Photo Booth flow

Camera → countdown → review/retake → processing with email entry → finished strip.
Generation starts after the visitor accepts the captured photo. Each booth uses
a persistent shuffled deck of 24 scene concepts: four per capture, six strips
before reshuffling. The creature slot cycles through six different species.
[Scene catalog and persistence](PHOTOBOOTH-SCENES.md) describe the rotation.
Costumes, body poses, camera angles and props vary; faces remain recognizable.

The recipient is saved locally before its Signal is delivered to the same
Workflow. A network outage queues both the capture and recipient for retry.
Generation can finish first; delivery waits up to 24 hours for an email address.
The old email-first API remains available for older clients.

The finished strip and explanation occupy the top half of the launcher. The
bottom half has talking points, architecture, SDK code and the exact Temporal
execution. Flight Simulator exposes the same bottom panel at its final leaderboard;
its live flight keeps the full application area. Workflow links stay inside the
launcher, preserving the strip/game screen.

Deploy the Photo Booth API and worker together for capture-first sessions.
Provider output still needs a real OpenAI rehearsal; automated tests use fake
providers and never email an attendee.

## Mixed client/API versions

Managed booths serve their local UI while online API requests go to the hosted
service. Pulling `main` and running `local.sh` updates the local UI; it does not
prove that Fieldkit has rebuilt the hosted API/worker.

If the capture request gets HTTP 422 with `body.email` missing, the UI keeps the
portrait and collects email before starting generation through the older API.
It does not call the missing recipient endpoint or claim generation has started.
Updated APIs still render while visitors type. Error handling retains only the
status and validation field/type; it never displays echoed capture payloads.

Hosted rollout verification (read-only; no provider calls):

```bash
curl -fsS https://reinvent-booth.tmprl-demo.cloud/photobooth/openapi.json \
  | python3 -c 'import json,sys; s=json.load(sys.stdin); print("capture_first", "wait_for_email" in s["components"]["schemas"]["StartRequest"]["properties"]); print("recipient_route", any(p.endswith("/recipient") for p in s["paths"]))'
curl -fsS https://reinvent-booth.tmprl-demo.cloud/flightsim/api/flight/capabilities
```

Both photo checks must be `True`. Flight must report `touch_flight` and
`cargo_score_loss` as `true`; an older API returns 404. The API and worker must
come from the same reviewed release before the new flight is started.
