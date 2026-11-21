/**
 * Flies Ziggy around the screensaver stage.
 *
 * One requestAnimationFrame loop writes a single transform (translate3d +
 * rotate) to Ziggy's wrapper, so React never re-renders during flight and the
 * browser can composite it on the GPU. Paths are Catmull-Rom splines through
 * the given points, parametrized by distance so speed stays even, with
 * ease-in-out and a lean into the direction of travel.
 *
 * With reduced motion, flights become a quick fade out and back in at the
 * destination, and the hover drift is switched off.
 */
import { ZIGGY_FIST, ZIGGY_HAND, ZIGGY_VIEWBOX } from './Ziggy'

export interface Pt {
  x: number
  y: number
}

interface Flight {
  pts: Pt[]
  cum: number[]
  total: number
  t0: number
  dur: number
  resolve: () => void
}

export class AbortedError extends Error {}

/** setTimeout as a promise that rejects when the show is stopped. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AbortedError())
    const id = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new AbortedError())
    }, { once: true })
  })
}

const easeInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t
  const t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) }
}

export class Pilot {
  pos: Pt = { x: -400, y: -400 }
  facing: 1 | -1 = 1
  private tilt = 0
  private anchor: Pt | null = null
  private hoverT0 = 0
  private flight: Flight | null = null
  private raf = 0
  private last: Pt = { x: 0, y: 0 }
  private el: HTMLElement
  private flipEl: HTMLElement
  private reduced: boolean

  constructor(el: HTMLElement, flipEl: HTMLElement, reduced: boolean) {
    this.el = el
    this.flipEl = flipEl
    this.reduced = reduced
  }

  get w() {
    return this.el.offsetWidth || 200
  }
  get h() {
    return this.w * (ZIGGY_VIEWBOX.h / ZIGGY_VIEWBOX.w)
  }

  start() {
    const tick = (now: number) => {
      this.frame(now)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.flight?.resolve()
    this.flight = null
  }

  private frame(now: number) {
    let p = this.pos
    if (this.flight) {
      const f = this.flight
      const u = clamp((now - f.t0) / f.dur, 0, 1)
      p = this.pointAt(f, easeInOut(u))
      if (u >= 1) {
        this.flight = null
        this.anchor = p
        this.hoverT0 = now
        f.resolve()
      }
    } else if (this.anchor) {
      const t = (now - this.hoverT0) / 1000
      const amp = this.reduced ? 0 : 1
      p = {
        x: this.anchor.x + amp * Math.sin(t * 0.9) * this.w * 0.035,
        y: this.anchor.y + amp * Math.sin(t * 1.6) * this.h * 0.03,
      }
    }
    const vx = p.x - this.last.x
    this.last = p
    this.pos = p
    const target = this.flight && !this.reduced ? clamp(vx * 0.9, -16, 16) : 0
    this.tilt += (target - this.tilt) * 0.12
    this.el.style.transform = `translate3d(${p.x - this.w / 2}px, ${p.y - this.h / 2}px, 0) rotate(${this.tilt.toFixed(2)}deg)`
    this.el.dataset.thrust = this.flight ? 'high' : 'idle'
  }

  private pointAt(f: Flight, e: number): Pt {
    const d = e * f.total
    let i = 0
    while (i < f.cum.length - 2 && f.cum[i + 1] < d) i++
    const segLen = f.cum[i + 1] - f.cum[i] || 1
    const t = clamp((d - f.cum[i]) / segLen, 0, 1)
    const P = f.pts
    return catmull(P[Math.max(0, i - 1)], P[i], P[i + 1], P[Math.min(P.length - 1, i + 2)], t)
  }

  face(dir: 1 | -1) {
    this.facing = dir
    this.flipEl.style.transform = dir === 1 ? 'scaleX(1)' : 'scaleX(-1)'
  }

  /** Jump without flying (e.g. to an off-screen start point). */
  place(p: Pt) {
    this.flight?.resolve()
    this.flight = null
    this.anchor = null
    this.pos = p
    this.last = p
  }

  /** Drive Ziggy's position directly (e.g. hand on the slot lever). Call once per frame. */
  hold(p: Pt) {
    this.flight?.resolve()
    this.flight = null
    this.anchor = null
    this.pos = p
  }

  /** Float gently around a point. */
  hover(p: Pt) {
    this.flight?.resolve()
    this.flight = null
    this.anchor = p
    this.hoverT0 = performance.now()
  }

  /** Fly along a smooth curve through `via` to `to`. Resolves on arrival. */
  async flyTo(to: Pt, opts: { via?: Pt[]; dur?: number; face?: 1 | -1 | 'auto' } = {}): Promise<void> {
    const from = { ...this.pos }
    const face = opts.face ?? 'auto'
    if (face === 'auto') {
      if (Math.abs(to.x - from.x) > this.w * 0.3) this.face(to.x > from.x ? 1 : -1)
    } else this.face(face)

    if (this.reduced) {
      this.el.style.transition = 'opacity 220ms'
      this.el.style.opacity = '0'
      await new Promise((r) => setTimeout(r, 240))
      this.place(to)
      this.anchor = to
      this.el.style.opacity = '1'
      await new Promise((r) => setTimeout(r, 240))
      return
    }

    const pts = [from, ...(opts.via ?? []), to]
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    const total = cum[cum.length - 1]
    const stage = Math.hypot(window.innerWidth, window.innerHeight)
    const dur = opts.dur ?? clamp(650 + 1500 * (total / stage), 650, 2600)
    this.flight?.resolve()
    return new Promise((resolve) => {
      this.anchor = null
      this.flight = { pts, cum, total, t0: performance.now(), dur, resolve }
    })
  }

  /** Offset from Ziggy's center to the fingertip or fist, in px, for the given facing. */
  handOffset(kind: 'finger' | 'fist', facing: 1 | -1 = this.facing): Pt {
    const hand = kind === 'finger' ? ZIGGY_HAND : ZIGGY_FIST
    const s = this.w / ZIGGY_VIEWBOX.w
    return {
      x: facing * (hand.x - ZIGGY_VIEWBOX.w / 2) * s,
      y: (hand.y - ZIGGY_VIEWBOX.h / 2) * s,
    }
  }

  /** Where Ziggy's center must be for the hand to land on `p`. */
  centerFor(p: Pt, kind: 'finger' | 'fist', facing: 1 | -1): Pt {
    const o = this.handOffset(kind, facing)
    return { x: p.x - o.x, y: p.y - o.y }
  }
}
