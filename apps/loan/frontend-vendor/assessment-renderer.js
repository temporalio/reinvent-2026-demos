/* Render model-provided markdown as formatting, tables, and safe links only. */
(function (global) {
  'use strict';

  const tags = [
    'p', 'br', 'strong', 'em', 'del', 'blockquote', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a',
  ];
  const safeProtocols = new Set(['http:', 'https:', 'mailto:']);

  function render(target, markdown) {
    const text = typeof markdown === 'string' ? markdown : String(markdown ?? '');
    if (!global.marked?.parse || !global.DOMPurify?.isSupported) {
      target.textContent = text;
      return;
    }

    try {
      const parsed = global.marked.parse(text, {async: false, gfm: true});
      const fragment = global.DOMPurify.sanitize(parsed, {
        ALLOWED_TAGS: tags,
        ALLOWED_ATTR: ['href', 'title'],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
        ALLOWED_NAMESPACES: ['http://www.w3.org/1999/xhtml'],
        RETURN_DOM_FRAGMENT: true,
      });
      if (!fragment || fragment.nodeType !== 11) throw new Error('Expected sanitized DOM');

      for (const link of fragment.querySelectorAll('a')) {
        const href = link.getAttribute('href');
        if (!href) continue;
        try {
          const url = new global.URL(href, target.ownerDocument.baseURI);
          if (!safeProtocols.has(url.protocol)) throw new Error('Unsupported link protocol');
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
        } catch {
          link.removeAttribute('href');
        }
      }
      target.replaceChildren(fragment);
    } catch {
      // Missing/broken parser or sanitizer must never fall back to raw HTML.
      target.textContent = text;
    }
  }

  global.LoanAssessment = Object.freeze({render});
})(window);
