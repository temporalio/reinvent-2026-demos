<script lang="ts">
  import { createHarnessContext } from "@temporalio/agent-harness-svelte";
  import { createTrip, loadView, newSessionId, type PageView } from "./api.ts";
  import logo from "./assets/temporal-logo.svg";
  import { motion, toggleMotion } from "./motion.svelte.ts";
  import Backdrop from "./Backdrop.svelte";
  import Trip from "./Trip.svelte";

  createHarnessContext();

  let view = $state<PageView | null>(null);
  let loadError = $state<string | null>(null);
  // The session the page shows, and the one it is creating (null once created).
  let sessionId = $state<string | null>(null);
  // Its Workflow run, when known, so the Temporal UI link opens the run directly.
  let runId = $state<string | null>(null);
  let creating = $state<string | null>(null);
  let preview = $state<boolean | null>(null);
  let previewNotice = $state<string | null>(null);

  function show(id: string, run: string | null = null) {
    const url = new URL(location.href);
    url.searchParams.set("s", id);
    history.replaceState(null, "", url);
    sessionId = id;
    runId = run;
  }

  function newTrip() {
    if (!view || preview !== false) return;
    // The page names the session and switches to it immediately; the trip opens once
    // Temporal has started the Workflow, usually before anyone has finished typing.
    const id = newSessionId(view.session_prefix);
    creating = id;
    sessionId = null;
    createTrip(id).then(
      (session) => {
        if (creating === id) {
          creating = null;
          show(id, session.run_id ?? null);
        }
      },
      (error: Error) => {
        creating = null;
        loadError = `Couldn't start a trip: ${error.message}`;
      },
    );
  }

  Promise.all([
    loadView(),
    fetch("/travel-agent/api/local-preview").then(response => {
      if(!response.ok) throw new Error("Demo capabilities could not be loaded");
      return response.json() as Promise<{preview:boolean;notice:string|null}>;
    }),
  ]).then(
    ([loaded, capabilities]) => {
      preview = capabilities.preview;
      previewNotice = capabilities.notice;
      view = loaded;
      const requested = new URL(location.href).searchParams.get("s");
      const latest = loaded.sessions
        .filter((s) => !s.closed)
        .sort((a, b) => b.created_at - a.created_at)[0];
      if (requested?.startsWith(loaded.session_prefix)) {
        show(requested, loaded.sessions.find((s) => s.workflow_id === requested)?.run_id ?? null);
      } else if (latest) show(latest.workflow_id, latest.run_id ?? null);
      else if (!preview) newTrip();
    },
    (error: Error) => (loadError = error.message),
  );

  // With the run ID the link opens the run itself. Without one the Temporal UI looks the
  // run up with a list query, which on Temporal Cloud misses a Workflow started a moment
  // ago, and the booth's Temporal UI panel follows this link as soon as it appears.
  const workflowLink = $derived(
    view && sessionId
      ? `${view.temporal_ui_url}/workflows/${encodeURIComponent(sessionId)}` +
          (runId ? `/${encodeURIComponent(runId)}/timeline` : "")
      : null,
  );
  const consoleLink = $derived(sessionId ? `console/?s=${encodeURIComponent(sessionId)}` : "console/");
</script>

<div class="app" class:motion-paused={motion.paused}>
  <Backdrop />
  <header class="topbar">
    <div class="brand">
      <img src={logo} alt="Temporal" width="132" height="34" />
      <div>
        <p class="eyebrow">Agent Harness · Code Mode · Human in the loop</p>
        <h1 class="title">Ziggy, a <span class="text-gradient-ultraviolet">durable</span> travel agent</h1>
      </div>
    </div>
    <nav class="links" aria-label="Views">
      {#if workflowLink}
        <a class="button small secondary ultraviolet" href={workflowLink} target="_blank" rel="noreferrer">Temporal UI ↗</a>
      {/if}
      <a class="button small secondary ultraviolet" href={consoleLink}>Harness console</a>
      {#if !motion.reduced}
        <button class="button small secondary ultraviolet" aria-pressed={motion.paused} onclick={toggleMotion}>
          {motion.paused ? "Play motion" : "Pause motion"}
        </button>
      {/if}
      <button class="button small primary ultraviolet" onclick={newTrip} disabled={!view || preview !== false || creating !== null}>
        New trip
      </button>
    </nav>
  </header>

  {#if previewNotice}<aside class="card booth-native-notice" role="status">{previewNotice}</aside>{/if}

  {#if loadError}
    <div class="card failure" role="alert"><span class="badge error">error</span> {loadError}</div>
  {/if}

  {#if sessionId && !preview}
    {#key sessionId}
      <Trip {sessionId} {runId} />
    {/key}
  {:else if preview}
    <main class="workspace preview-workspace">
      <section class="card" aria-labelledby="preview-conversation"><p class="eyebrow">01 / CONVERSATION</p><h2 id="preview-conversation">No trip is running</h2><p>The travel agent's conversations and bookings will appear here after an inference-enabled worker is configured.</p></section>
      <section class="card" aria-labelledby="preview-controls"><p class="eyebrow">02 / APPROVALS & STATUS</p><h2 id="preview-controls">Waiting for an agent session</h2><p>Model settings, tool approvals, and booking status belong here. This preview does not start an agent or invent a booking.</p></section>
    </main>
  {:else if !loadError}
    <div class="card starting" role="status">
      <p class="heading">{creating ? "Starting a new trip…" : "Loading your trips…"}</p>
      <p class="muted">
        {creating ? "Temporal is starting the agent Workflow that will hold this conversation." : ""}
      </p>
    </div>
  {/if}
</div>
