# Touch flight

Autopilot steers throughout the flight. Tap the view to fire at that location;
tap a repair tile to restore a failed system. Different fingers can use the view
and repair tiles independently. The Temporal button remains a touch control.

| Failed system | Consequence |
| --- | --- |
| Engines | Lower flight speed and distance-point earnings |
| Shields | Collisions inflict double damage |
| Nav | Autopilot flies an erratic route |
| Blasters | Tapping the view cannot fire |
| Cargo | Subtract up to 600 points/second from the accumulated score |
| Sensors | Hazards become cloaked |
| Life support | Visibility narrows |

Cargo loss stops at zero. Repair stops further loss; it does not restore lost
points. Telemetry persists total lost cargo and the reduced score in the same
Workflow. Re-crossing a previous points threshold does not award another charge.

Deploy the matching Flight API and worker with this client. The capability check
blocks starting the new game against an older API that rejects decreasing scores.
On managed stations the UI is local, while online requests still use the hosted
backend. Offline mode uses the prepared local API/worker.

The final leaderboard shares the launcher with its lower architecture, code and
Temporal panels. Inspect the last flight's telemetry Updates and event Activities;
Temporal coordinates session state rather than rendering individual frames.
