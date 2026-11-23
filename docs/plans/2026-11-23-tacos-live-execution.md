# Tacos execution walkthrough

Connect the shared architecture and code panels to the tacos app's existing order events. Start with tacos; other demos retain their current illustrative views.

Use five compact phases: Order, Kitchen delivery, Ready signal, Finish, and Recovery. Both panels share the selected phase. Follow live tracks reported events; tapping a phase pauses following without changing the order. Returning to live catches up. A new order or Order Again resets browsing and progress together.

Show the latest reported application step, rather than claiming instruction-level telemetry. A completed kitchen delivery advances to the workflow's ready-signal wait. Interrupted updates remain visibly interrupted. Direct-call mode does not claim to run Workflow code. Python phase excerpts come verbatim from the checked-in Workflow; other SDK examples remain explicitly illustrative.

Accept messages only from the owned demo iframe and the current origin. Include order identity, mode, latest step, final outcome, and connection state. Validate payloads and reject stale cross-order events. Exercise retries, waiting, completion, failure, manual browsing, and repeat orders.
