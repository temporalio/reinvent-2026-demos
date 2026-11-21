import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'

/**
 * A slot-machine word reel. `spin(target)` scrolls a strip of random words
 * past the window and lands on `target` with a small overshoot-and-settle
 * bounce. Only `transform` is animated (Web Animations API). Long phrases are
 * scaled down to fit the window width.
 *
 * `lines` = how many rows show through the window (1 for the classic headline,
 * 3 for the slot machine's drum, where the neighbors peek above and below).
 */
export interface ReelHandle {
  spin(target: string, ms?: number): Promise<void>
}

const LH = 1.18 // em per row

export function Reel({
  ref,
  words,
  initial,
  lines = 1,
  reduced,
  className = '',
}: {
  ref: Ref<ReelHandle>
  words: string[]
  initial: string
  lines?: 1 | 3
  reduced: boolean
  className?: string
}) {
  const pad = (lines - 1) / 2
  const rnd = useCallback(() => words[Math.floor(Math.random() * words.length)], [words])
  const [strip, setStrip] = useState<string[]>(() => [
    ...Array.from({ length: pad }, rnd),
    initial,
    ...Array.from({ length: pad }, rnd),
  ])
  const winRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const anim = useRef<Animation | null>(null)
  const popNext = useRef(false)
  const pending = useRef<{ from: number; to: number; ms: number; done: () => void } | null>(null)

  // Fit each word to the window width (transform scale only; layout unaffected).
  const fit = useCallback(() => {
    const win = winRef.current
    if (!win) return
    const max = win.clientWidth * 0.94
    win.querySelectorAll<HTMLSpanElement>('.ss-reel-word').forEach((s) => {
      const w = s.offsetWidth
      s.style.transform = w > max ? `scale(${(max / w).toFixed(3)})` : ''
    })
  }, [])

  useLayoutEffect(() => {
    fit()
    const p = pending.current
    const el = stripRef.current
    if (p && el) {
      pending.current = null
      const y = (i: number) => `translate3d(0, ${-(i - pad) * LH}em, 0)`
      const over = p.to + 0.16
      anim.current = el.animate(
        [
          { transform: y(p.from), easing: 'cubic-bezier(.3,0,.25,1)' },
          { transform: `translate3d(0, ${-(over - pad) * LH}em, 0)`, offset: 0.9, easing: 'ease-in-out' },
          { transform: y(p.to) },
        ],
        { duration: p.ms, fill: 'forwards' },
      )
      anim.current.onfinish = () => {
        popNext.current = true
        setStrip((s) => s.slice(p.to - pad, p.to + pad + 1))
        p.done()
      }
    } else if (anim.current) {
      // The strip was trimmed to the landed rows: drop the finished animation
      // before paint so there's no jump.
      anim.current.cancel()
      anim.current = null
      if (popNext.current) {
        // A little "ding": the landed word pops (scale composes with the fit transform).
        popNext.current = false
        el?.children[pad]?.animate(
          [{ scale: '1.12', filter: 'brightness(1.6)' }, { scale: '1', filter: 'brightness(1)' }],
          { duration: 600, easing: 'cubic-bezier(.2,1.5,.4,1)' },
        )
      }
    }
  }, [strip, pad, fit])

  useEffect(() => {
    const on = () => fit()
    window.addEventListener('resize', on)
    document.fonts?.ready.then(on)
    return () => window.removeEventListener('resize', on)
  }, [fit])

  useImperativeHandle(
    ref,
    () => ({
      spin(target, ms = 2600) {
        return new Promise<void>((resolve) => {
          if (reduced) {
            const win = winRef.current
            const out = win?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' })
            setTimeout(() => {
              setStrip([...Array.from({ length: pad }, rnd), target, ...Array.from({ length: pad }, rnd)])
              out?.cancel()
              win?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350 })
              setTimeout(resolve, 380)
            }, 260)
            return
          }
          setStrip((cur) => {
            // Never show the landing word next to itself.
            const other = () => {
              let w = rnd()
              while (w === target && words.length > 1) w = rnd()
              return w
            }
            const filler = Array.from({ length: 22 }, other)
            const next = [...cur, ...filler, target, ...Array.from({ length: pad }, other)]
            pending.current = { from: pad, to: next.length - 1 - pad, ms, done: resolve }
            return next
          })
        })
      },
    }),
    [pad, rnd, reduced, words],
  )

  return (
    <div ref={winRef} className={`ss-reel ${className}`} style={{ height: `${lines * LH}em` }}>
      <div ref={stripRef} className="ss-reel-strip">
        {strip.map((w, i) => (
          <div key={i} className="ss-reel-row" style={{ height: `${LH}em` }}>
            <span className="ss-reel-word">{w}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
