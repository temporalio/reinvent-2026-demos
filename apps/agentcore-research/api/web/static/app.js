// The starship engineering demo's screen. One poll (/api/view) reads everything; each button
// is one request whose response is applied at once (guide 21).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const PHASES = {
    diagnosing: { label: "Diagnosing", status: "active" },
    awaiting_approval: { label: "Waiting for the captain", status: "waiting" },
    remediating: { label: "Repairing", status: "active" },
    closing: { label: "Standing down", status: "active" },
    resolved: { label: "Repaired", status: "completed" },
    closed: { label: "Closed, ship unchanged", status: "skipped" },
  };
  const TOOL_LABELS = {
    read_telemetry: "Read telemetry",
    search_ship_logs: "Search ship logs",
    list_recent_maintenance: "Check the maintenance log",
    apply_repair: "Apply the repair",
    invoke_model: "Model call",
  };

  let scenario = null;
  let incidentId = new URLSearchParams(location.hash.slice(1)).get("incident");
  let last = null;
  // A decision the server has accepted but the memo doesn't show yet.
  let sentDecision = null;

  const agentSteps = Steps.mount($("agent-steps"));
  const proofRows = Steps.mount($("proof-rows"));

  const feed = Live.poll({
    load: (signal) => fetch(viewUrl(), { signal }).then(readJson),
    interval: 1000,
    onData: render,
    onState: Live.freshness($("freshness")),
  });

  function viewUrl() {
    return incidentId ? `api/view?incident=${incidentId}` : "api/view";
  }

  async function readJson(res) {
    if (res.status === 404 && incidentId) {
      // An incident from another session or a reset dev server.
      setIncident(null);
      return fetch("api/view").then(readJson);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || body.title || `${res.status}`);
    return body;
  }

  function setIncident(id) {
    incidentId = id;
    sentDecision = null;
    history.replaceState(null, "", id ? `#incident=${id}` : location.pathname);
  }

  // ---------- render ----------

  function render(view) {
    last = view;
    const inc = view.incident;
    if (!inc && !scenariosLoaded) loadScenarios();
    $("start-panel").hidden = !!inc;
    $("incident-panel").hidden = !inc;
    $("incident-title").textContent = inc ? inc.scenario.title : "Alarms on Ziggy's starship";
    $("worker-title").textContent = view.workerLocation === "local" ? "On-demand worker" : "Worker on AgentCore";
    renderWorker(view, inc);
    if (!inc) {
      renderProof(null);
      $("temporal-link").hidden = true;
      return;
    }
    if (sentDecision && inc.decision) sentDecision = null;
    $("temporal-link").hidden = !inc.temporalUrl;
    if (inc.temporalUrl) $("temporal-link").href = inc.temporalUrl;
    renderIncident(inc);
    renderProof(inc.proof);
  }

  // A new set of alarms for each visit to the start screen. With Claude Haiku
  // configured the API writes them fresh; otherwise they come from the ship's
  // built-in library, and the screen says which.
  let scenariosLoaded = false;
  async function loadScenarios() {
    scenariosLoaded = true;
    scenario = null;
    $("start").disabled = true;
    const box = $("scenarios");
    box.setAttribute("aria-busy", "true");
    box.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Scanning the ship for faults…" }));
    $("scenario-source").textContent = "";
    try {
      const res = await fetch("api/scenarios");
      if (!res.ok) throw await problem(res);
      const { scenarios, source } = await res.json();
      renderScenarios(scenarios);
      $("scenario-source").textContent = source === "haiku"
        ? "Fresh alarms, written for this visit by Claude Haiku on Amazon Bedrock."
        : "Alarms from the ship's built-in training library.";
    } catch (e) {
      box.replaceChildren();
      $("start-error").textContent = `Couldn't scan the ship: ${e.message}`;
      scenariosLoaded = false;
    } finally {
      box.removeAttribute("aria-busy");
    }
  }

  function renderScenarios(list) {
    const box = $("scenarios");
    box.replaceChildren();
    for (const s of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip scenario";
      const title = Object.assign(document.createElement("strong"), { textContent: s.title });
      const alert = Object.assign(document.createElement("span"), { textContent: s.alert });
      b.append(title, alert);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        scenario = s.key;
        for (const c of box.children) c.setAttribute("aria-pressed", String(c === b));
        $("start").disabled = false;
      });
      box.append(b);
    }
  }

  function phaseOf(inc) {
    if (sentDecision && inc.phase === "awaiting_approval") return sentDecision.approved ? "remediating" : "closing";
    if (inc.status === "Running") return inc.phase || "diagnosing";
    if (inc.status === "Completed") return inc.phase;
    return null;
  }

  function renderIncident(inc) {
    const phase = phaseOf(inc);
    const p = PHASES[phase] || { label: inc.status, status: inc.status };
    $("phase-badge").dataset.status = Status.normalize(p.status);
    $("phase-badge").textContent = p.label;
    $("alert-text").textContent = inc.scenario.alert;
    $("model-line").textContent = inc.model ? `Strands agent · model: ${inc.model}` : "Strands agent";

    const steps = inc.steps.map((s, i) => s.kind === "tool"
      ? { key: `s${i}`, label: TOOL_LABELS[s.tool] || s.tool, status: s.status === "error" ? "skipped" : "completed", detail: s.text, time: clock(s.at) }
      : { key: `s${i}`, label: "Agent", status: "completed", detail: s.text, time: clock(s.at) });
    if (phase === "diagnosing" || phase === "remediating" || phase === "closing") {
      steps.push({ key: `next${steps.length}`, label: phase === "diagnosing" ? "Investigating" : "Continuing", status: "active", detail: inc.waiting ? "Waiting for a Worker to pick this up" : "" });
    }
    agentSteps.render(steps, inc.workflowId);

    const awaiting = phase === "awaiting_approval";
    $("proposal").hidden = !awaiting;
    if (awaiting && inc.proposal) renderProposal(inc.proposal);

    const done = inc.status !== "Running";
    $("new-incident").hidden = !done;
    $("outcome").hidden = !done;
    if (done) {
      const ok = inc.status === "Completed";
      $("outcome").className = ok ? "outcome callout" : "outcome state-banner is-error";
      $("outcome").textContent = ok ? inc.summary : `The Workflow ended as ${inc.status}. Open it in the Temporal UI.`;
    }
  }

  function renderProposal(p) {
    const facts = $("proposal-facts");
    facts.replaceChildren(...[["System", p.system], ["Repair", p.action], ["Target", p.target]].map(([k, v]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v || "—";
      dd.className = "plain";
      row.append(dt, dd);
      return row;
    }));
    $("proposal-rationale").textContent = p.rationale || "";
  }

  function renderWorker(view, inc) {
    const w = view.worker;
    const where = view.workerLocation === "local" ? "the local agent container" : "AgentCore";
    let status, headline, detail;
    if (!w.known) {
      status = "pending"; headline = "Can't tell"; detail = w.error || "";
    } else if (w.running) {
      status = "active"; headline = "Worker running";
      detail = `${w.identity} · build ${w.buildId} · up ${since(w.startedAt)}`;
    } else {
      status = "skipped"; headline = "No Worker running";
      detail = `No compute is in use. ${where === "AgentCore" ? "The AgentCore session has ended." : "The agent container is idle."}`;
    }
    $("worker").dataset.status = status;
    $("worker-headline").textContent = headline;
    $("worker-detail").textContent = detail;

    // Waking: Temporal holds a task and no Worker is running yet. Only a
    // start, a Signal or an Update creates such a task; the screen's reads don't.
    const waking = inc && inc.status === "Running" && inc.waiting && w.known && !w.running;
    $("waking").hidden = !waking;
    if (waking) {
      $("waking-title").textContent = "Starting a Worker";
      $("waking-text").textContent = view.workerLocation === "local"
        ? `A ${inc.waiting.task} is waiting ${since(inc.waiting.since)}. The local invoker calls the agent's /invocations, as Temporal Cloud would.`
        : `A ${inc.waiting.task} is waiting ${since(inc.waiting.since)}. Temporal Cloud is invoking the agent on AgentCore; a cold start takes a few seconds.`;
    }
  }

  function renderProof(p) {
    $("tile-model").textContent = p ? p.modelCalls : 0;
    $("tile-tool").textContent = p ? p.toolCalls : 0;
    $("tile-repeat").textContent = p ? p.repeats : 0;
    $("tile-workers").textContent = p ? p.workers.length : 0;
    $("proof-title").textContent = p && p.repeats ? `${p.repeats} call${p.repeats > 1 ? "s" : ""} retried` : "Every call ran once";
    if (!p) return proofRows.render([], "none");
    const short = workerNames(p.workers);
    const rows = p.rows.map((r, i) => {
      if (r.kind === "worker") return { key: `r${i}`, label: `${short[r.name]} picked up the Workflow`, status: "completed", detail: r.name, time: clock(r.at) };
      if (r.kind === "signal") return { key: `r${i}`, label: "Decision Signal recorded", status: "completed", detail: "Written to history with no Worker running", time: clock(r.at) };
      return {
        key: `r${i}`,
        label: r.kind === "model" ? "Model call" : TOOL_LABELS[r.name] || r.name,
        status: r.status,
        detail: r.worker ? `on ${short[r.worker]}${r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}` : "",
        time: r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : clock(r.at),
      };
    });
    proofRows.render(rows, last.incident.workflowId);
  }

  function workerNames(identities) {
    const out = {};
    identities.forEach((id, i) => { out[id] = `Worker ${i + 1}`; });
    return out;
  }

  // ---------- actions ----------

  $("start").addEventListener("click", async () => {
    const id = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, "0");
    await act($("start"), "Starting…", $("start-error"), async () => {
      const res = await fetch("api/incidents", post({ id, scenario }));
      if (res.status === 410) {
        // The API restarted and forgot this set of alarms: offer a fresh one.
        loadScenarios();
        throw new Error("Those alarms have cleared. Here is a fresh set.");
      }
      // 409 is this browser's own earlier attempt at the same ID.
      if (res.status !== 201 && res.status !== 409) throw await problem(res);
      setIncident(id);
      if (res.status === 201) render(await res.json());
    });
  });

  for (const [btn, approved] of [[$("approve"), true], [$("reject"), false]]) {
    btn.addEventListener("click", () => act(btn, approved ? "Approving…" : "Rejecting…", $("decide-help"), async () => {
      const res = await fetch(`api/incidents/${incidentId}/decision`, post({ approved, note: $("note").value }));
      if (res.status !== 202) throw await problem(res);
      sentDecision = (await res.json()).decision;
      $("note").value = "";
      if (last) render(last);
    }));
  }

  $("new-incident").addEventListener("click", () => {
    setIncident(null);
    scenariosLoaded = false;
    $("start-error").textContent = "";
    feed.refresh();
  });

  async function act(btn, busyLabel, errorEl, fn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = busyLabel;
    try {
      await fn();
      feed.refresh();
    } catch (e) {
      errorEl.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.textContent = label;
    }
  }

  function post(body) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }

  async function problem(res) {
    const body = await res.json().catch(() => ({}));
    return new Error(body.detail || (body.errors || []).join("; ") || body.title || `Request failed (${res.status})`);
  }

  // ---------- formatting ----------

  function clock(at) {
    if (!at) return "";
    const d = new Date(at);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }

  function since(at) {
    if (!at || !last) return "";
    const s = Math.max(0, Math.round((new Date(last.serverTime) - new Date(at)) / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }
})();
