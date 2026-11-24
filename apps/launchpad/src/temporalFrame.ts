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

// Temporal UI reads its theme when it boots from this same-origin localStorage key
// (a JSON boolean, or "system"). Its persistStore also listens on a BroadcastChannel
// named after the key, so an app that has already loaded switches too.
const DARK_MODE_KEY = 'dark mode'

/** Show the panel's Temporal UI in dark mode. Call before the iframe loads. */
export function preferDarkTemporalUi() {
  try {
    window.localStorage.setItem(DARK_MODE_KEY, 'true')
    const channel = new BroadcastChannel(`persist-store-${DARK_MODE_KEY}`)
    channel.postMessage(true)
    channel.close()
  } catch {
    // Without storage the UI follows the system theme.
  }
}

/** Hide Temporal UI's navigation chrome. Call on every iframe load. */
export function styleTemporalFrame(frame: HTMLIFrameElement) {
  const doc = loadedDocument(frame)
  if (!doc) return
  if (!doc.getElementById(CHROME_STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = CHROME_STYLE_ID
    style.textContent = CHROME_CSS
    doc.head.append(style)
  }
  // Input assistance belongs to the booth; Temporal UI keeps its own layout/theme.
  if (!doc.getElementById('booth-temporal-keyboard')) {
    const style = doc.createElement('link')
    style.rel = 'stylesheet'
    style.href = '/booth/keyboard.css'
    const script = doc.createElement('script')
    script.id = 'booth-temporal-keyboard'
    script.src = '/booth/touch-keyboard.js'
    doc.head.append(style, script)
  }
}

/**
 * Show a same-origin Temporal UI URL. Clicking a link inside the loaded app lets
 * its client router handle it; before the app has loaded, replace the src.
 */
export function showInTemporalFrame(frame: HTMLIFrameElement, url: string, options: { resetScroll?: boolean } = {}) {
  const doc = loadedDocument(frame)
  if (!doc) {
    frame.src = url
    return
  }
  function resetScroll() {
    if (!options.resetScroll) return
    if (doc!.scrollingElement) doc!.scrollingElement.scrollTop = 0
    // Temporal UI has nested scrolling regions. An explicit attendee selection
    // should reveal the workflow header even when the router keeps the same URL.
    for (const element of doc!.querySelectorAll<HTMLElement>('*')) {
      if (element.scrollTop) element.scrollTop = 0
    }
  }
  resetScroll()
  const link = doc.createElement('a')
  link.href = url
  link.hidden = true
  doc.body.append(link)
  link.click()
  link.remove()
  if (options.resetScroll) frame.contentWindow?.requestAnimationFrame(resetScroll)
}
