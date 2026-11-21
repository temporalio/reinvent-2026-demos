import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react'
import type { Pt } from './pilot'

/**
 * The Vegas variant: a space-age slot machine. "WHAT IF YOUR" sits above the
 * reel window and "NEVER CRASHED?" below it; the reel itself is passed in as
 * `reel`. The lever on the right is drawn as if it swings toward the viewer:
 * the rod foreshortens (scaleY by cos θ) and the knob moves straight down and
 * grows a little, so Ziggy's hand can follow it in 2D.
 */
export interface SlotHandle {
  /** Lever angle in degrees: 0 = up, 180 = all the way down. */
  setLever(deg: number): void
  /** The knob's center (viewport px) at a given lever angle. */
  knobAt(deg: number): Pt
  /** Where coins pour out (viewport px) and the floor they land on. */
  trayMouth(): { mouth: Pt; floor: number }
}

const BULBS = 22

export function SlotMachine({
  ref,
  reel,
  before,
  after,
  button,
  jackpot,
  spinning,
}: {
  ref: Ref<SlotHandle>
  reel: ReactNode
  before: string
  after: string
  button: ReactNode
  jackpot: boolean
  spinning: boolean
}) {
  const leverRef = useRef<HTMLDivElement>(null)
  const rodRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    setLever(deg) {
      const L = leverRef.current?.offsetHeight ?? 0
      const r = (deg * Math.PI) / 180
      const c = Math.cos(r)
      const s = Math.sin(r)
      if (rodRef.current) rodRef.current.style.transform = `scaleY(${c.toFixed(4)})`
      if (knobRef.current)
        knobRef.current.style.transform = `translate3d(-50%, ${(-L * c).toFixed(1)}px, 0) translateY(-50%) scale(${(1 + 0.28 * Math.max(0, s)).toFixed(3)})`
    },
    knobAt(deg) {
      const el = leverRef.current
      if (!el) return { x: 0, y: 0 }
      const b = el.getBoundingClientRect()
      const L = el.offsetHeight
      return { x: b.left + b.width / 2, y: b.bottom - L * Math.cos((deg * Math.PI) / 180) }
    },
    trayMouth() {
      const t = trayRef.current?.getBoundingClientRect()
      if (!t) return { mouth: { x: innerWidth / 2, y: innerHeight * 0.7 }, floor: innerHeight * 0.95 }
      return { mouth: { x: t.left + t.width / 2, y: t.top + t.height * 0.35 }, floor: innerHeight * 0.965 }
    },
  }))

  return (
    <div className={`ss-slot ${jackpot ? 'is-jackpot' : ''} ${spinning ? 'is-spinning' : ''}`}>
      <div className="ss-slot-cabinet">
        <div className="ss-slot-marquee">
          <div className="ss-bulbs" aria-hidden>
            {Array.from({ length: BULBS }, (_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 4) * 0.15}s` }} />
            ))}
          </div>
          <div className="ss-marquee-sign">
            <span className="ss-marquee-mark" />
            <span>Durable Jackpot</span>
            <span className="ss-marquee-mark" />
          </div>
        </div>
        <div className="ss-slot-glass">
          <div className="ss-slot-line ss-slot-before">{before}</div>
          <div className="ss-slot-window">
            <span className="ss-payline left" />
            {reel}
            <span className="ss-payline right" />
          </div>
          <div className="ss-slot-line ss-slot-after">{after}</div>
        </div>
        <div className="ss-slot-deck">{button}</div>
        <div ref={trayRef} className="ss-slot-tray">
          <span />
        </div>
      </div>
      <div className="ss-lever-mount" aria-hidden>
        <div ref={leverRef} className="ss-lever">
          <div ref={rodRef} className="ss-lever-rod" />
          <div ref={knobRef} className="ss-lever-knob" />
        </div>
        <div className="ss-lever-base" />
      </div>
    </div>
  )
}

/* ------------------------------ Coins ------------------------------ */

export interface CoinsHandle {
  burst(from: Pt, floor: number, count: number): void
  clear(): void
}

interface Coin {
  el: HTMLDivElement
  x: number
  y: number
  vx: number
  vy: number
  ry: number
  vry: number
  rz: number
  born: number
  resting: boolean
}

/**
 * Temporal-logo coins with simple physics: gravity, a bouncy floor with
 * friction, and a 3D flip (rotateY) so both faces show the logo as they
 * tumble. Coins are plain DOM nodes driven by one rAF loop (transform and
 * opacity only) and removed after they fade.
 */
export function Coins({ ref }: { ref: Ref<CoinsHandle> }) {
  const layer = useRef<HTMLDivElement>(null)
  const coins = useRef<Coin[]>([])
  const raf = useRef(0)
  const lastT = useRef(0)

  const loop = (now: number) => {
    const dt = Math.min(0.033, (now - lastT.current) / 1000 || 0.016)
    lastT.current = now
    const H = innerHeight
    const g = 3.2 * H
    const alive: Coin[] = []
    for (const c of coins.current) {
      const age = (now - c.born) / 1000
      if (age < 0) {
        alive.push(c)
        continue
      }
      if (!c.resting) {
        c.vy += g * dt
        c.x += c.vx * dt
        c.y += c.vy * dt
        c.ry += c.vry * dt
        c.rz += c.vx * dt * 0.08
        const floor = Number(c.el.dataset.floor)
        if (c.y > floor) {
          c.y = floor
          c.vy *= -0.38
          c.vx *= 0.72
          c.vry *= 0.7
          if (Math.abs(c.vy) < H * 0.06) c.resting = true
        }
      } else {
        // settle flat, face up
        const target = Math.round(c.ry / 180) * 180
        c.ry += (target - c.ry) * 0.15
        c.x += c.vx * dt
        c.vx *= 0.9
      }
      const fade = age > 3 ? Math.max(0, 1 - (age - 3) / 0.8) : 1
      c.el.style.opacity = age < 0.05 ? '0' : fade.toFixed(2)
      c.el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0) rotateZ(${c.rz.toFixed(1)}deg) rotateY(${c.ry.toFixed(1)}deg)`
      if (fade <= 0) c.el.remove()
      else alive.push(c)
    }
    coins.current = alive
    raf.current = alive.length ? requestAnimationFrame(loop) : 0
  }

  useImperativeHandle(ref, () => ({
    burst(from, floor, count) {
      const host = layer.current
      if (!host) return
      const W = innerWidth
      const H = innerHeight
      const now = performance.now()
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div')
        el.className = 'ss-coin'
        el.innerHTML = '<i class="ss-coin-face"></i><i class="ss-coin-face back"></i>'
        el.dataset.floor = String(floor - Math.random() * H * 0.05)
        el.style.opacity = '0'
        host.appendChild(el)
        const dir = Math.random() < 0.5 ? -1 : 1
        coins.current.push({
          el,
          x: from.x + (Math.random() - 0.5) * W * 0.06,
          y: from.y,
          vx: dir * (0.08 + Math.random() * 0.4) * Math.min(W, H * 0.9),
          vy: -(0.05 + Math.random() * 0.3) * H,
          ry: Math.random() * 180,
          vry: (Math.random() < 0.5 ? -1 : 1) * (500 + Math.random() * 700),
          rz: (Math.random() - 0.5) * 40,
          born: now + i * (900 / count),
          resting: false,
        })
      }
      if (!raf.current) {
        lastT.current = performance.now()
        raf.current = requestAnimationFrame(loop)
      }
    },
    clear() {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      coins.current.forEach((c) => c.el.remove())
      coins.current = []
    },
  }))

  return <div ref={layer} className="ss-coins" aria-hidden />
}
