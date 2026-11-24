// steps.js — the Workflow's steps, as a live timeline.
// The clearest "what is Temporal doing right now" view across the demos. Renders into
// an <ol class="steps"> styled by css/temporal-components.css, reusing the existing
// elements on each update so the list doesn't flicker and only genuinely new steps
// animate in.
//
//   <ol class="steps" id="steps" aria-live="polite"></ol>
//   <script src="assets/js/status.js"></script>
//   <script src="assets/js/steps.js"></script>
//   <script>
//     const timeline = Steps.mount(document.getElementById("steps"));
//     timeline.render([
//       { key: "validate", label: "Validate expense", status: "completed", time: "0.4s" },
//       { key: "pay", label: "Pay out", status: "retrying", detail: "Payment provider timed out",
//         note: "Next attempt in 4s", attempt: 3 },
//     ], expense.id);   // second argument resets the list when it's for something else
//   </script>
//
// A step: { key, label, status, detail, note, time, attempt, icon }
//   key      stable identity, so a step keeps its element between renders
//   status   anything Status.normalize() understands
//   detail   one quiet line under the label
//   note     a line in the status colour, for a countdown or an attempt count
//   time     right-hand column; use "\n" for a second line (a span that is still open)
//
// Requires status.js.
(function () {
  "use strict";

  // Finished states get a mark in the dot. Held states stay empty and pulse instead.
  const MARKS = { completed: "✓", failed: "!", skipped: "–" };

  function mount(list, options) {
    if (!list) throw new Error("Steps.mount needs an <ol> or <ul>");
    const opts = options || {};
    let keys = [];

    // render(steps) updates in place. Pass a scope — a Workflow ID, a request ID — to
    // rebuild from scratch when the list is for a different thing entirely, so one
    // Workflow's steps never animate into another's.
    function render(steps, scope) {
      const incoming = (steps || []).map((s, i) => ({ ...s, key: s.key || String(i) }));

      if (scope !== undefined && list.dataset.scope !== String(scope)) {
        list.replaceChildren();
        list.dataset.scope = String(scope);
        keys = [];
      }

      const existing = new Map(keys.map((k, i) => [k, list.children[i]]));
      const fragment = document.createDocumentFragment();

      for (const step of incoming) {
        const seen = existing.get(step.key);
        const li = seen || create();
        if (!seen) li.classList.add("enter");
        update(li, step);
        fragment.append(li);
        existing.delete(step.key);
      }
      for (const orphan of existing.values()) orphan?.remove();

      list.append(fragment);
      keys = incoming.map((s) => s.key);
      return list;
    }

    function create() {
      const li = document.createElement("li");
      li.className = "step";
      // Drop the entrance class once it has played, so the element is clean if the
      // list is rebuilt and this step appears again.
      li.addEventListener("animationend", () => li.classList.remove("enter"), { once: true });
      for (const cls of ["dot", "step-label", "step-time", "step-detail", "step-note"]) {
        const span = document.createElement("span");
        span.className = cls;
        li.append(span);
      }
      return li;
    }

    function update(li, step) {
      const status = Status.normalize(step.status);
      li.dataset.status = status;
      li.dataset.key = step.key;

      const dot = li.querySelector(".dot");
      dot.textContent = step.icon ?? MARKS[status] ?? "";

      // An attempt count belongs on a step that is still trying, not on one that
      // already succeeded; the retries are part of its history by then.
      const attempts = step.attempt > 1 && !Status.isTerminal(status) ? ` · attempt ${step.attempt}` : "";
      setText(li, ".step-label", step.label + attempts);
      setText(li, ".step-time", step.time);
      setText(li, ".step-detail", step.detail);
      setText(li, ".step-note", step.note);

      // The colour alone never carries the state (guide 04): name it for assistive
      // technology, which cannot see the dot.
      li.setAttribute("aria-label", `${step.label}: ${Status.label(status)}`);
      opts.onStep?.(li, step, status);
    }

    function setText(li, selector, value) {
      const el = li.querySelector(selector);
      const text = value == null ? "" : String(value);
      if (el.textContent !== text) el.textContent = text;
      el.hidden = text === "";
    }

    return { render, get keys() { return keys.slice(); } };
  }

  window.Steps = { mount };
})();
