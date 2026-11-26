# Photo Booth flow

Camera → countdown → review/retake → processing with email entry → finished strip.
Generation starts after the visitor accepts the captured photo. Four distinct
scenes are selected from 17 adventures, including nine playful alien encounters.
Costumes, colors, settings and camera angles vary; faces remain recognizable.

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
