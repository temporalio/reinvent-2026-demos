# Ziggy Space Taqueria verification

Verified locally on November 19, 2026. This is a re:Invent 2026 reskin; contact Ian Douglas or Tomas Josovsky with questions.

## Passed

- Docker build, including TypeScript checking and the Vite production build.
- ESLint with no errors or warnings.
- Six Node behavior tests, executed in the frontend build container: persona defaults, safe Temporal links, payment hold/capture/release states, latest retry state, same-origin embedding, and terminal step state.
- Containerized Python API/worker and persistent local Temporal. No backend or Workflow source changes.
- Real order `order-8879dc07`: kitchen restored, submission succeeded on attempt 5, kitchen ready Signal received, payment captured. Temporal history records the Signal before capture; execution completed.
- Real order `order-1b1d5435`: kitchen stayed offline for all 10 attempts; release-hold Activity and notification ran. UI reported hold released; the compensating Workflow completed.
- Final-build order `order-a059c42a`: recovered on attempt 3, marked ready, payment captured, completed badge.
- Traditional comparison: failed on attempt 1, retained the payment hold, and offered no Temporal execution link.
- All nine code choices display content and preserve the workflow. Python full source is imported at build time; other SDK excerpts and the Swift outline are labeled separately. Other SDK workers were not executed.
- All four persona defaults and mid-order perspective changes preserve the workflow.
- Local Temporal UI embeds through the same-origin `/temporal-ui/` proxy. Its namespace list and the exact order timeline rendered. `X-Frame-Options: SAMEORIGIN` remains intact.
- Panel zoom buttons and synthetic two-finger events change only their panel; one-finger events are not prevented. The outer viewport scale stayed at 1.
- Portrait renders inspected at 1080×1920 and 2160×3840, plus a 900×1400 demo viewport. No outer horizontal overflow at those sizes. Browser reported no JavaScript errors.
- Cloud overlay configuration validated with dummy credentials only. Local configuration clears inherited Cloud endpoint/auth/TLS values for API and worker.
- `nginx -t`, `git diff --check`, and toolkit Cosmic Pop CSS comparison passed.

## Still unverified

- Temporal Cloud authentication, execution, and switching with real credentials.
- Physical TV, rubber-tip stylus, multi-touch behavior, and reach on the booth mounts. Gestures inside Temporal UI belong to that application.
- Physical internet-disconnect behavior, station controller integration, and operation on the actual Mac Minis. Cache images before the event; building requires network access.
- Swift is a clearly labeled illustrative outline, not a compiled SDK implementation. The other non-Python workers and SDK excerpts were not validated by this pass.

`npm ci` reported 18 dependency vulnerabilities, including 8 high-severity findings. The JavaScript lockfile is unchanged; dependency remediation was not part of this reskin.

Screenshots and detailed command output are local, gitignored artifacts in `tmp/`. The Docker preview runs at http://127.0.0.1:15310. See the README for start/stop commands and the Cloud overlay.
