import { useMemo } from 'react'

/**
 * Deep-space backdrop: three starfield layers drifting at different speeds
 * (parallax), a nebula glow, a ringed planet and a small moon. Stars are
 * box-shadows on one tiny element per layer, tiled twice vertically, and each
 * layer only animates `transform`, so this is cheap even at 4K.
 */
function starShadows(count: number, size: number, seed: number, color: string): string {
  // Deterministic pseudo-random so the sky doesn't reshuffle on re-render.
  let s = seed
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const x = (r() * 100).toFixed(2)
    const y = (r() * 100).toFixed(2)
    const a = (0.35 + r() * 0.65).toFixed(2)
    // Positions are in vw/vh so the field fills any screen; the second copy
    // sits one screen lower to tile seamlessly.
    out.push(`${x}vw ${y}vh 0 ${size}px rgba(${color},${a})`)
    out.push(`${x}vw calc(${y}vh + 100vh) 0 ${size}px rgba(${color},${a})`)
  }
  return out.join(',')
}

export function Backdrop() {
  const layers = useMemo(
    () => [
      { shadow: starShadows(140, 0.6, 7, '255,255,255'), cls: 'ss-stars-far' },
      { shadow: starShadows(70, 1.1, 99, '220,230,255'), cls: 'ss-stars-mid' },
      { shadow: starShadows(26, 1.8, 4242, '255,236,210'), cls: 'ss-stars-near' },
    ],
    [],
  )
  return (
    <div className="ss-backdrop" aria-hidden>
      <div className="ss-nebula" />
      {layers.map((l) => (
        <div key={l.cls} className={`ss-stars ${l.cls}`}>
          <div className="ss-star-dot" style={{ boxShadow: l.shadow }} />
        </div>
      ))}
      <div className="ss-planet">
        <div className="ss-planet-body" />
        <div className="ss-planet-ring" />
      </div>
      <div className="ss-moon" />
    </div>
  )
}
