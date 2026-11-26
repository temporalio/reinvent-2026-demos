// Delegated input support also covers forms mounted after the demo starts.
(() => {
  if (window.__boothTouchKeyboard) return;
  window.__boothTouchKeyboard = true;
  const TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);
  let target = null, draft = '', start = 0, end = 0, shift = false, writing = false;
  let originalInputMode = null;
  const panel = document.createElement('section');
  panel.className = 'booth-touch-keyboard touch-keyboard';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'On-screen keyboard');
  const label = document.createElement('strong');
  label.className = 'booth-keyboard-label';
  const preview = document.createElement('div');
  preview.className = 'touch-keyboard-field booth-keyboard-value';
  preview.setAttribute('role', 'status');
  const rows = document.createElement('div');
  rows.className = 'booth-keyboard-keys';
  const tools = document.createElement('div');
  tools.className = 'touch-keyboard-row booth-keyboard-tools';
  panel.append(label, preview, rows, tools);
  // Legacy apps zoom their body to fit. The keyboard uses the actual iframe size.
  document.documentElement.append(panel);

  function editable(element) {
    if (!(element instanceof Element)) return null;
    const field = element.closest('input,textarea,[contenteditable="true"],[contenteditable=""]');
    if (!field || field.disabled || field.readOnly || field.closest('[data-booth-keyboard="native"]')) return null;
    return field.tagName === 'INPUT' && !TYPES.has(field.type) ? null : field;
  }
  function eventField(event) {
    for (const node of event.composedPath()) {
      const field = editable(node);
      if (field) return field;
    }
    return null;
  }
  function read() {
    if (!target) return;
    draft = target.isContentEditable ? target.textContent || '' : target.value;
    try {
      start = target.selectionStart ?? draft.length;
      end = target.selectionEnd ?? start;
    } catch { start = end = draft.length; }
    showValue();
  }
  function showValue() {
    preview.textContent = target?.type === 'password' ? '•'.repeat(draft.length) : draft || ' ';
  }
  function commit(value, caret) {
    if (!target?.isConnected) { close(); return; }
    const maximum = target.maxLength >= 0 ? target.maxLength : Infinity;
    if (value.length > maximum) return;
    draft = value; start = end = caret;
    writing = true;
    if (target.isContentEditable) target.textContent = draft;
    else {
      // Bypass React's value tracker; the bubbling input event updates its state.
      const proto = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(target, draft);
      try { target.setSelectionRange(caret, caret); } catch { /* Number fields have no selection API. */ }
    }
    target.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, inputType: 'insertText'}));
    target.dispatchEvent(new Event('change', {bubbles: true}));
    writing = false;
    showValue();
  }
  function insert(value) {
    if (!target) return;
    if (target.type !== 'number') read();
    if (target.type === 'number' && !/^[0-9.+-]+$/.test(value)) return;
    commit(draft.slice(0, start) + value + draft.slice(end), start + value.length);
  }
  function backspace() {
    if (!target) return;
    if (target.type !== 'number') read();
    const from = start === end ? Math.max(0, start - 1) : start;
    commit(draft.slice(0, from) + draft.slice(end), from);
  }
  function button(text, action, aria) {
    const key = document.createElement('button');
    key.type = 'button'; key.textContent = text;
    if (aria) key.setAttribute('aria-label', aria);
    key.addEventListener('pointerdown', event => event.preventDefault());
    key.addEventListener('click', action);
    return key;
  }
  function render() {
    rows.replaceChildren(); tools.replaceChildren();
    const layout = target?.type === 'number' ? ['1234567890', '.-+'] : ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '@.+_-/:,?!'];
    for (const characters of layout) {
      const row = document.createElement('div'); row.className = 'touch-keyboard-row';
      for (const character of characters) {
        const value = shift ? character.toUpperCase() : character;
        row.append(button(value, () => insert(value)));
      }
      rows.append(row);
    }
    if (target?.type !== 'number') {
      tools.append(button('Shift', () => {shift = !shift; render();}), button('Space', () => insert(' ')));
    }
    if (target?.tagName === 'TEXTAREA' || target?.isContentEditable) tools.append(button('↵', () => insert('\n'), 'New line'));
    tools.append(button('⌫', backspace, 'Backspace'), button('Clear', () => commit('', 0)), button('Done', close));
  }
  function open(field) {
    if (target === field && !panel.hidden) return;
    close(); target = field; shift = false;
    originalInputMode = field.getAttribute('inputmode');
    field.setAttribute('inputmode', 'none');
    label.textContent = field.getAttribute('aria-label') || field.labels?.[0]?.textContent.trim() || field.placeholder || field.name || 'Text entry';
    read(); render(); panel.hidden = false;
  }
  function close() {
    // A number input cannot hold "12." while it is being typed. Finish it as 12.
    if (target?.type === 'number' && target.isConnected && target.value === '' && draft.trim() && Number.isFinite(Number(draft))) {
      const value = String(Number(draft));
      commit(value, value.length);
    }
    if (target) {
      if (originalInputMode === null) target.removeAttribute('inputmode');
      else target.setAttribute('inputmode', originalInputMode);
    }
    panel.hidden = true; target = null; draft = ''; preview.textContent = '';
  }
  document.addEventListener('focusin', event => {
    const field = eventField(event); if (field) open(field);
  });
  document.addEventListener('pointerdown', event => {
    if (event.composedPath().includes(panel)) return;
    const field = eventField(event);
    if (field) open(field); else close();
  }, true);
  document.addEventListener('input', event => { if (!writing && event.composedPath().includes(target)) read(); });
  document.addEventListener('selectionchange', () => {
    if (!writing && target && target.type !== 'number' && document.activeElement === target) read();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  new MutationObserver(() => { if (target && !target.isConnected) close(); }).observe(document.documentElement, {childList: true, subtree: true});
})();
