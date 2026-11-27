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

## Photo and strip resolution

New OpenAI renders request 1920×1088 at the existing medium quality setting.
The API requires dimensions divisible by 16; the renderer trims four pixels
from the top and bottom to produce each 1920×1080 landscape photo. It does not
stretch or upscale that output. The full-resolution JPEG strip stacks four
photos vertically, retaining the film border and gaps: **2060×4700** including
the Temporal mark, caption, visible `temporal.io` address and date footer.
The email includes that JPEG as an attachment and a clickable Temporal website
link, while keeping the Replay invitation and contact footer. JPEG attachments
cannot carry clickable hyperlinks inside the image.

The animated preview uses 800×450 source frames and produces a 470×1090 GIF.
It never builds ten full-resolution animation canvases. Its smaller resolution
does not affect the emailed still. The offline illustration renderer remains
800×600 internally; offline illustrations and already-rendered legacy frames
can be normalized into the new strip, but that cannot invent native detail.
`GET /api/photobooth/capabilities` (hosted at
`/photobooth/api/photobooth/capabilities`) reports the frame, strip and animated-preview
dimensions without starting a session. A synthetic provider check returned
1920×1088 natively, then produced the expected Full HD frame and 2060×4700 strip.
Completed strips are not regenerated. A real new capture is needed to assess
provider latency, attachment size and final visual quality after deployment.

OpenAI sizing: https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options
