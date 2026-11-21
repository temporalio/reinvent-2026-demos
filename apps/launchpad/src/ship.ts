import decksJson from './decks.json'

// Every deck of the ship and the demos on it. Ports follow docs/ports.md.
// Demo URLs are built from the Launchpad's own hostname, so the same
// Launchpad works on a station, a staff laptop, or across the booth LAN.

export type DeckId = 'transporter' | 'bridge' | 'engineering' | 'arboretum' | 'sickbay' | 'holodeck'

export interface Demo {
  id: string
  name: string
  blurb: string
  port: number
  /** Path and query on the demo's web server */
  path: string
  /** Needs the internet for its full (non-mock) experience */
  online?: boolean
}

export interface Deck {
  id: DeckId
  name: string
  side: 'left' | 'right'
  audience: string
  finds: string
  color: 'sky' | 'gold' | 'orange' | 'green' | 'blue' | 'lavender'
  demos: Demo[]
}

// Top to bottom along the launch shaft, alternating left and right. The right
// column sits half a step higher than the left (see Launchpad in App.tsx).
// The data lives in decks.json so the Booth Control hub and the station agent
// can read it too (card ids are what the admin panel's demo on/off switches use;
// card ports are how the agent maps a card to the ship.sh process serving it).
export const DECKS: Deck[] = decksJson as Deck[]

/**
 * Where a demo lives, relative to wherever the Launchpad is being served from.
 * `?launchpad=` and `?deck=` tell the demo's back button to return one level
 * up, to this deck; `?station=` and `?hub=` are passed through.
 */
export function demoUrl(d: Demo, deck: DeckId): string {
  const { protocol, hostname } = window.location
  const url = new URL(`${protocol}//${hostname}:${d.port}${d.path}`)
  url.searchParams.set('launchpad', window.location.origin)
  url.searchParams.set('deck', deck)
  // Keep the station and the Booth Control hub, so the demo's admin panel and
  // settings follow this station.
  const q = new URLSearchParams(window.location.search)
  for (const k of ['station', 'hub']) {
    const v = q.get(k)
    if (v) url.searchParams.set(k, v)
  }
  return url.toString()
}

/** The demo's origin, for the reachability probe. */
export function demoOrigin(d: Demo): string {
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:${d.port}/`
}
