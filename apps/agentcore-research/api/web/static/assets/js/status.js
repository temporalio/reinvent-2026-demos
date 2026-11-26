// status.js — one vocabulary for the state of a piece of work.
// Four demos each grew their own status-to-colour map; this is the reconciled one.
// Pairs with the [data-status] rules in css/temporal-components.css.
//
// Canonical states, by whether the work is moving, held, done or broken:
//   pending · active · waiting · retrying · completed · failed · skipped
//
// Red means a real failure and nothing else (guide 02). A cancellation is
// deliberate, so it reads as skipped, not failed.
//
//   <script src="assets/js/status.js"></script>
//   <script>
//     el.dataset.status = Status.normalize(step.state);   // "retrying"
//     el.textContent    = Status.label(el.dataset.status); // "Retrying"
//   </script>
//
// No dependencies.
(function () {
  "use strict";

  const STATES = ["pending", "active", "waiting", "retrying", "completed", "failed", "skipped"];

  // Whatever a backend happens to call it, mapped to the vocabulary. Add demo-specific
  // names with Status.alias() rather than editing this file.
  const ALIASES = {
    // not started
    pending: "pending", queued: "pending", scheduled: "pending", not_started: "pending",
    // moving
    active: "active", running: "active", in_progress: "active", started: "active",
    executing: "active", continuedasnew: "active",
    // held on a person, a signal or a timer
    waiting: "waiting", blocked: "waiting", awaiting_approval: "waiting",
    pending_approval: "waiting", awaiting_signal: "waiting", sleeping: "waiting", timer: "waiting",
    // held, and attempting again
    retrying: "retrying", retry: "retrying", backoff: "retrying",
    // finished well. "recovered" belongs here: it succeeded. Say that it took several
    // attempts in the step's own text, not by colouring a success as a problem.
    completed: "completed", complete: "completed", done: "completed", success: "completed",
    succeeded: "completed", ok: "completed", recovered: "completed",
    // broken
    failed: "failed", failure: "failed", error: "failed", timedout: "failed",
    timed_out: "failed", terminated: "failed",
    // deliberately not run
    skipped: "skipped", cancelled: "skipped", canceled: "skipped", not_applicable: "skipped",
  };

  const LABELS = {
    pending: "Pending", active: "Running", waiting: "Waiting", retrying: "Retrying",
    completed: "Completed", failed: "Failed", skipped: "Skipped",
  };

  // A state that will not change again without new input.
  const TERMINAL = { completed: true, failed: true, skipped: true };

  function normalize(raw) {
    if (!raw) return "pending";
    const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
    return ALIASES[key] || ALIASES[key.replace(/_/g, "")] || "pending";
  }

  function label(status) {
    return LABELS[normalize(status)];
  }

  // Teach the vocabulary a name this demo's API uses.
  //   Status.alias({ awaiting_kitchen: "waiting", comped: "skipped" });
  function alias(map) {
    for (const [from, to] of Object.entries(map)) {
      const target = normalize(to);
      ALIASES[String(from).trim().toLowerCase().replace(/[\s-]+/g, "_")] = target;
    }
  }

  // Set the status on an element, and its label if it has one. Keeps the colour and
  // the words in step, so the state never depends on colour alone (guide 04).
  function apply(el, status, text) {
    if (!el) return;
    const state = normalize(status);
    el.dataset.status = state;
    if (text !== false) el.textContent = text || LABELS[state];
    return state;
  }

  // The furthest-along state in a set of steps, for a summary badge.
  function summarize(statuses) {
    const states = statuses.map(normalize);
    if (states.includes("failed")) return "failed";
    if (states.includes("retrying")) return "retrying";
    if (states.includes("waiting")) return "waiting";
    if (states.includes("active")) return "active";
    if (states.length && states.every((s) => TERMINAL[s])) return "completed";
    return "pending";
  }

  window.Status = {
    STATES,
    normalize,
    label,
    alias,
    apply,
    summarize,
    isTerminal: (s) => !!TERMINAL[normalize(s)],
  };
})();
