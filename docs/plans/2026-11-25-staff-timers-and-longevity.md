# Staff Timer Control and Browser Longevity

Localhost now uses the same 60-second idle navigation as hosted stations. The footer hourglass pauses or resumes those timers in this browser only. A crossed-out hourglass and “Paused” label make the manual mode visible. The choice survives refreshes through a versioned localStorage key; storage failure leaves the in-memory control usable. Resuming starts a fresh interval. Flight Simulator, Photo Booth, the Holodeck picker, staff settings, and playing video keep their existing exemptions.

The audit covers the shipped launchpad, embedded screensaver, shared iframe integration, and the ten interactive demo frontends. It checks browser-owned lifetimes, polling, streaming connections, retained histories, animation effects, camera tracks, and GPU resources. Five-day stability needs a longer acceptance run on the actual Mac Minis.

Travel Agent has a dedicated logical architecture panel. It separates the web API, Temporal Service, Agent Harness worker, Gemini model Activities, human approvals, Python sandbox, simulated travel Activities, and durable trip board. Highlights use reported phases or exact-run Activity metadata; unknown steps do not invent a highlight.

## Findings and Fixes

- The screensaver's large asteroid used `fill: forwards` without cancelling finished animations. Each trip could retain another filled effect. It now cancels the transparent final effect before scheduling the next trip. An accelerated browser check completed 200 trips with at most one effect retained.
- Photo Booth polling could apply an old visitor's result after that screen was closed. Polling now aborts on teardown, clears scheduled ticks, and rejects late results. Both Holodeck clients bound API requests to 15 seconds. Photo Booth also rejects stale analysis results and explicitly stops camera tracks and synthetic camera animation on page exit.
- Flight Simulator now cancels its render loop, disconnects its ResizeObserver, disposes render targets, geometry, materials and postprocessing passes, and releases its WebGL context on exit. Offline telemetry retains at most 240 pending game events. Short request-deadline timers are cleared when the underlying promise settles.
- No Roads metrics previously used an unguarded interval, allowing requests to overlap if the server stopped answering. It now permits one request at a time, times it out after ten seconds, and stops timers/requests on exit. Exact-run history polling in the launchpad also has a ten-second request deadline.
- Launchpad idle-monitor document listeners are pruned when iframe documents leave. Control-hub polling is single-flight with a four-second deadline. React/Svelte observers and SSE streams inspected in the shipped demo paths have teardown handlers. No Roads sparklines/feed, flight pools/leaderboard, and SDLC per-agent tool lists already have fixed limits. Travel Agent intentionally retains the current conversation; returning to the picker unmounts that iframe.

## Browser Evidence

Two isolated Chromium passes each launched nine demo routes 90 times in total, returning through the screensaver and crew picker without refreshing the launchpad. One pass kept automatic returns paused; the other kept them enabled. POST requests and scenario-generation endpoints were blocked, so no model calls, emails, bookings, or GitHub changes were made. AgentCore's polling was inspected in source but its unavailable local card was not exercised. Generated Photo Booth output, full SDLC runs, live Gemini conversations, and long-lived production Temporal UI sessions remain outside this bounded soak.

With timers enabled, retained JS heap after warm-up went from 5.36 MB at cycle 10 to 5.71 MB at cycle 90. Documents stayed at 49 and DOM nodes at 1,944; listeners returned to 569, with brief 12-listener differences during iframe teardown. The paused pass stayed at 70 documents, 2,510 nodes, and 1,144 listeners from cycles 10–90. Absolute counts include SVG documents and Chromium's cached pages; compare trends within a pass.

Chromium's native allocation estimate grew from 10.1 MB to 22.1 MB during the enabled pass. After an idle collection it fell to 15.2 MB; a simulated critical-memory notification reduced it further to 11.9 MB, with 24 documents and 839 nodes remaining. This shows reclaimable browser caching, not proof that every native allocation is bounded. The run did not show steadily retained DOM or JS object growth proportional to visits.

Real-time UI checks verified a pause lasting beyond 60 seconds, persistence across refresh, a full clock reset from an outer-region touch, and a return to the screensaver after resuming. Docker builds passed 80 launchpad tests, eight Photo Booth web tests, two Flight Simulator web tests, and TypeScript checks. The No Roads image built successfully. All 39 repository checks passed under Python 3.13; the initial system-Python run lacked PyYAML and was rerun with the required environment.

## Remaining Acceptance Gate

This is a bounded navigation soak, not a five-day endurance certification. Run the actual deployed URL on the intended Mac Mini/Chrome/TV setup for at least 24 hours, ideally for the full event duration. Record total browser and GPU process memory, not only JS heap. Include repeated generated Photo Booth results, full SDLC and Travel Agent sessions, overnight screensaver operation, an offline/reconnect interval, and TV off/on. Do not add automatic browser refreshes or clear browser settings as a substitute: staff pause state and station configuration must survive normal operation.

Repeat the local navigation check using `scripts/local/check-browser-memory.mjs` and a dedicated test browser's CDP URL. It never uses the attendee's Island window. Its current target is localhost:15111 and it writes metrics to an ignored tmp output file.
