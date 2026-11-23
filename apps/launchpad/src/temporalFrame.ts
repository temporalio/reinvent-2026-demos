/**
 * The lower Temporal UI panel is a same-origin /_temporal/ iframe. It loads once;
 * later workflow selections navigate inside it so Temporal UI's own router swaps
 * the page instead of the whole app rebooting.
 */

const CHROME_STYLE_ID = 'booth-temporal-chrome'
// Selectors from Temporal UI's rendered DOM: the left sidebar's wrapper and the
// top bar holding the namespace selector (which becomes a bottom bar below `md`).
const CHROME_CSS = `
div:has(> nav[data-testid="navigation-header"]), nav[data-testid="top-nav"] { display: none !important; }
main#content { padding-bottom: 0 !important; }
`

function loadedDocument(frame: HTMLIFrameElement): Document | null {
  try {
    const doc = frame.contentDocument
    return doc && doc.readyState === 'complete' && doc.location.href !== 'about:blank' ? doc : null
  } catch {
    return null
  }
}

/** Hide Temporal UI's navigation chrome. Call on every iframe load. */
export function styleTemporalFrame(frame: HTMLIFrameElement) {
  const doc = loadedDocument(frame)
  if (!doc || doc.getElementById(CHROME_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = CHROME_STYLE_ID
  style.textContent = CHROME_CSS
  doc.head.append(style)
}

/**
 * Show a same-origin Temporal UI URL. Clicking a link inside the loaded app lets
 * its client router handle it; before the app has loaded, replace the src.
 */
export function showInTemporalFrame(frame: HTMLIFrameElement, url: string) {
  const doc = loadedDocument(frame)
  if (!doc) {
    frame.src = url
    return
  }
  const link = doc.createElement('a')
  link.href = url
  link.hidden = true
  doc.body.append(link)
  link.click()
  link.remove()
}
