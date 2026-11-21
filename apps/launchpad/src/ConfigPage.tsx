import { useEffect } from 'react'
import { ConfigScreen } from './ship-ui/admin'

/** The Launchpad home for this station, keeping `?station=` and `?hub=` (never the screen staff came from). */
function launchpadHome(): string {
  const q = new URLSearchParams(window.location.search)
  const url = new URL('/', window.location.origin)
  for (const k of ['station', 'hub']) {
    const v = q.get(k)
    if (v) url.searchParams.set(k, v)
  }
  return url.toString()
}

/**
 * `/config` on the Launchpad: the staff config page every Ziggy button links
 * to (docs/admin-panel.md). The PIN pad, then the Booth Control admin panel,
 * full screen. Nothing on it times out (no deck idle, no screensaver: the
 * Launchpad's App isn't mounted here). Exit is a full navigation to this
 * station's Launchpad home; the PIN session is forgotten with the page.
 */
export default function ConfigPage() {
  useEffect(() => {
    document.title = 'Booth Control · Launchpad'
  }, [])
  return <ConfigScreen onExit={() => window.location.assign(launchpadHome())} exitLabel="Exit" />
}
