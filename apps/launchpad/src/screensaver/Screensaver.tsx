import { useEffect, useMemo, useRef, useState } from 'react'
import { useScreenLayout } from '../ship-ui'
import { Backdrop } from './Backdrop'
import { FOOTER, HEADLINE, REEL_ITEMS, SCENE_ORDER, type ReelItem, type SceneId } from './content'
import { AbortedError, Pilot, sleep, type Pt } from './pilot'
import { Reel, type ReelHandle } from './Reel'
import { SCENE_SCRIPTS, Scene } from './scenes'
import { Coins, SlotMachine, type CoinsHandle, type SlotHandle } from './SlotMachine'
import { Ziggy, type ZiggyMood, type ZiggyPose } from './Ziggy'
import './screensaver.css'

/**
 * Attract-mode screensaver for the Launchpad.
 *
 * - 'slots' (default, it's Vegas): Ziggy pulls a slot machine's lever, the
 *   reel lands on "What if your ____ never crashed?", Temporal coins spill out.
 * - 'classic': the same headline as a giant word reel while Ziggy loops around.
 *
 * Both then share the loop: Ziggy taps Learn more, the card shows how Temporal
 * helps for ~8 s, Ziggy taps Done. Every few rounds a short scene plays.
 * Any tap or key exits (handled by the parent via onExit).
 */
export type ScreensaverVariant = 'slots' | 'classic'

const READ_MS = 8000
const WORDS = REEL_ITEMS.map((i) => i.word)

/** Shuffle bag: every item once before any repeats, and no back-to-back repeat across bags. */
function makeBag() {
  let bag: ReelItem[] = []
  let last: ReelItem | null = null
  return () => {
    if (!bag.length) {
      bag = [...REEL_ITEMS].sort(() => Math.random() - 0.5)
      if (bag[bag.length - 1] === last) bag.unshift(bag.pop()!)
    }
    last = bag.pop()!
    return last
  }
}

function useReducedMotion(): boolean {
  const forced = new URLSearchParams(location.search).get('motion') === 'reduce'
  const [r, setR] = useState(() => forced || matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (forced) return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [forced])
  return r
}

function useLandscape(): boolean {
  const q = () => innerWidth > innerHeight * 1.1
  const [l, setL] = useState(q)
  useEffect(() => {
    const on = () => setL(q())
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  return l
}

export default function Screensaver({
  variant,
  onExit,
  cyclesPerScene = 2,
  startScene,
}: {
  variant: ScreensaverVariant
  onExit: () => void
  /** Reel rounds between scenes. */
  cyclesPerScene?: number
  /** Play this scene first (testing). */
  startScene?: SceneId
}) {
  useScreenLayout() // sets html[data-layout] → --ship-type
  const landscape = useLandscape()
  const reduced = useReducedMotion()

  const [mode, setMode] = useState<'reel' | 'scene'>('reel')
  const [sceneId, setSceneId] = useState<SceneId>('durable')
  const [sceneStep, setSceneStep] = useState(0)
  const [item, setItem] = useState<ReelItem>(REEL_ITEMS[0])
  const [cardOpen, setCardOpen] = useState(false)
  const [pressed, setPressed] = useState<'learn' | 'done' | null>(null)
  const [pose, setPose] = useState<ZiggyPose>('fly')
  const [mood, setMood] = useState<ZiggyMood>('happy')
  const [spinning, setSpinning] = useState(false)
  const [landed, setLanded] = useState(0) // bump to flash the headline/lights
  const [jackpot, setJackpot] = useState(false)

  const ziggyRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<HTMLDivElement>(null)
  const reelRef = useRef<ReelHandle>(null)
  const learnRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<SlotHandle>(null)
  const coinsRef = useRef<CoinsHandle>(null)

  const initialWord = useMemo(() => WORDS[0], [])

  useEffect(() => {
    if (!ziggyRef.current || !flipRef.current) return
    const pilot = new Pilot(ziggyRef.current, flipRef.current, reduced)
    pilot.start()
    const ctl = new AbortController()
    const sig = ctl.signal
    const nextItem = makeBag()
    const wait = (ms: number) => sleep(ms, sig)
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const rectOf = (el: Element | null | undefined) => el?.getBoundingClientRect()
    const landscapeNow = () => innerWidth > innerHeight * 1.1
    const SW = () => innerWidth
    const SH = () => innerHeight
    const clampY = (y: number) => Math.min(SH() - pilot.h * 0.45, Math.max(pilot.h * 0.5, y))
    const clampX = (x: number) => Math.min(SW() - pilot.w * 0.45, Math.max(pilot.w * 0.45, x))

    /** Park Ziggy beside an element, pointing at it. */
    const besidePoint = (r: DOMRect, perch?: string | null): { at: Pt; face: 1 | -1 } => {
      const cy = r.top + r.height / 2
      if (perch === 'below') {
        // Hover under the element, pointing up-and-left at it.
        const c = pilot.centerFor({ x: r.left + r.width * 0.55, y: r.bottom + pilot.h * 0.08 }, 'finger', -1)
        return { at: { x: clampX(c.x), y: clampY(c.y + pilot.h * 0.12) }, face: -1 }
      }
      if (r.right + pilot.w * 0.98 < SW()) {
        const c = pilot.centerFor({ x: r.right + pilot.w * 0.02, y: cy }, 'finger', -1)
        return { at: { x: c.x, y: clampY(c.y) }, face: -1 }
      }
      if (r.left - pilot.w * 0.98 > 0) {
        const c = pilot.centerFor({ x: r.left - pilot.w * 0.02, y: cy }, 'finger', 1)
        return { at: { x: c.x, y: clampY(c.y) }, face: 1 }
      }
      // No room at the sides: perch over the top-right corner.
      return { at: { x: clampX(r.right - pilot.w * 0.35), y: clampY(r.top - pilot.h * 0.36) }, face: -1 }
    }

    /** Fly so the fingertip lands on an element, then tap it. */
    const tapEl = async (el: HTMLElement | null, which: 'learn' | 'done') => {
      const r = rectOf(el)
      if (!r) return
      const target = { x: r.left + r.width * 0.72, y: r.top + r.height * 0.5 }
      const face: 1 | -1 = target.x + pilot.w * 1.0 < SW() ? -1 : 1
      const at = pilot.centerFor(target, 'finger', face)
      setPose('fly')
      const mid = { x: (pilot.pos.x + at.x) / 2 + face * -pilot.w * 0.2, y: Math.min(pilot.pos.y, at.y) - pilot.h * 0.35 }
      const flight = pilot.flyTo(at, { via: [mid], face })
      await wait(250)
      setPose('point')
      await flight
      pilot.hold(at)
      await wait(180)
      setPose('tap')
      await wait(190)
      setPressed(which)
      await wait(330)
      setPose('point')
      pilot.hover(at)
      await wait(260)
      setPressed(null)
    }

    /** Ziggy's idle spot for each variant. */
    const restSpot = (): { at: Pt; face: 1 | -1 } => {
      if (variant === 'slots' && slotRef.current) {
        const k = slotRef.current.knobAt(0)
        return { at: { x: clampX(k.x + pilot.w * 0.55), y: clampY(k.y - pilot.h * 0.55) }, face: -1 }
      }
      const r = rectOf(headRef.current)
      if (!r) return { at: { x: SW() * 0.8, y: SH() * 0.2 }, face: -1 }
      return { at: { x: clampX(r.right - pilot.w * 0.2), y: clampY(r.top - pilot.h * 0.2) }, face: -1 }
    }

    const classicSpin = async (it: ReelItem) => {
      setPose('fly')
      setMood('happy')
      setSpinning(true)
      const spin = reelRef.current!.spin(it.word, 2800)
      // A loop-de-loop above the headline while the reel spins.
      const r = rectOf(headRef.current)!
      // Below the headline (where the card will open) if there's room, else above it.
      // Portrait: below the headline (where the card will open). Landscape: the empty right half.
      const below = r.bottom + pilot.h * 1.2 < SH()
      const c = landscapeNow()
        ? { x: SW() * 0.76, y: SH() * 0.5 }
        : {
            x: r.left + r.width * 0.5,
            y: below ? r.bottom + pilot.h * 0.75 : Math.max(pilot.h * 0.6, r.top - pilot.h * 0.15),
          }
      const rad = Math.min(r.width * 0.3, pilot.w * 1.1)
      const loop = [0.15, 0.4, 0.65, 0.9, 1.15].map((a) => ({
        x: c.x + Math.cos(a * Math.PI * 2) * rad,
        y: c.y + Math.sin(a * Math.PI * 2) * rad * 0.55,
      }))
      await pilot.flyTo({ x: c.x - rad * 0.2, y: c.y - rad * 0.4 }, { via: loop, dur: 2600 })
      await spin
      setSpinning(false)
      setLanded((n) => n + 1)
      setMood('wow')
      await wait(700)
      setMood('happy')
    }

    const pullLever = async (it: ReelItem) => {
      const slot = slotRef.current!
      // Fly to the knob and grab it (Ziggy on the right, facing the machine).
      const grabAt = () => pilot.centerFor(slot.knobAt(0), 'fist', -1)
      setPose('fly')
      setMood('happy')
      const g0 = grabAt()
      await pilot.flyTo(g0, { via: [{ x: g0.x + pilot.w * 0.4, y: g0.y - pilot.h * 0.5 }], face: -1 })
      setPose('grab')
      await wait(220)

      const tween = (from: number, to: number, ms: number, ease: (t: number) => number) =>
        new Promise<void>((resolve) => {
          const t0 = performance.now()
          const step = (now: number) => {
            if (sig.aborted) return resolve()
            const u = Math.min(1, (now - t0) / ms)
            const deg = from + (to - from) * ease(u)
            slot.setLever(deg)
            pilot.hold(pilot.centerFor(slot.knobAt(deg), 'fist', -1))
            if (u < 1) requestAnimationFrame(step)
            else resolve()
          }
          requestAnimationFrame(step)
        })

      if (reduced) {
        slot.setLever(150)
        await wait(300)
      } else {
        // Anticipation: a little lift, then the yank, then a bounce at the bottom.
        await tween(0, -16, 280, (t) => 1 - (1 - t) * (1 - t))
        setMood('wow')
        await tween(-16, 168, 340, (t) => t * t * t)
        await tween(168, 150, 120, (t) => t)
        await tween(150, 158, 120, (t) => t)
      }
      setSpinning(true)
      const spin = reelRef.current!.spin(it.word, 2900)
      // Let go: the lever springs back with a damped wobble; Ziggy floats up.
      setPose('fly')
      setMood('happy')
      pilot.hover({ x: pilot.pos.x + pilot.w * 0.25, y: pilot.pos.y - pilot.h * 0.15 })
      if (reduced) slot.setLever(0)
      else {
        const t0 = performance.now()
        await new Promise<void>((resolve) => {
          const step = (now: number) => {
            const t = (now - t0) / 1000
            const deg = 158 * Math.exp(-4.2 * t) * Math.cos(7.5 * t)
            slot.setLever(deg)
            if (t < 1.1 && !sig.aborted) requestAnimationFrame(step)
            else {
              slot.setLever(0)
              resolve()
            }
          }
          requestAnimationFrame(step)
        })
      }
      // Watch the reel from beside the window.
      const rs = restSpot()
      void pilot.flyTo({ x: rs.at.x, y: rs.at.y + pilot.h * 0.6 }, { face: -1 })
      await spin
      setSpinning(false)
      setLanded((n) => n + 1)
      setJackpot(true)
      setPose('cheer')
      setMood('happy')
      if (!reduced) {
        const { mouth, floor } = slot.trayMouth()
        coinsRef.current?.burst(mouth, floor, landscape ? 36 : 48)
      }
      await wait(1500)
      setJackpot(false)
      setPose('fly')
    }

    const learnMore = async (it: ReelItem) => {
      await tapEl(learnRef.current, 'learn')
      setItem(it)
      setCardOpen(true)
      setPose('fly')
      await wait(450)
      // Read along beside the card.
      const cr = rectOf(cardRef.current)
      if (cr) {
        // Landscape classic: the headline sits left of the card, so read from its lower-left corner.
        const b =
          variant === 'classic' && landscapeNow()
            ? { at: { x: clampX(cr.left - pilot.w * 0.3), y: clampY(cr.bottom - pilot.h * 0.2) }, face: 1 as const }
            : besidePoint(cr)
        await pilot.flyTo(b.at, { face: b.face })
        setPose('point')
        setMood('calm')
      }
      await wait(READ_MS - 1500)
      setMood('happy')
      await tapEl(doneRef.current, 'done')
      setCardOpen(false)
      setPose('fly')
      await wait(500)
    }

    const playScene = async (id: SceneId) => {
      setMode('scene')
      setSceneId(id)
      setSceneStep(0)
      await wait(500)
      for (const [i, beat] of SCENE_SCRIPTS[id].entries()) {
        const t0 = performance.now()
        setSceneStep(i)
        await frame()
        if (beat.mood) setMood(beat.mood)
        const f = document.querySelector('.ss-scene [data-focus]')
        const r = rectOf(f)
        if (r) {
          const b = besidePoint(r, landscapeNow() ? f?.getAttribute('data-perch-landscape') : null)
          setPose('fly')
          await pilot.flyTo(b.at, { face: b.face })
        }
        setPose(beat.pose ?? 'point')
        await wait(Math.max(400, beat.ms - (performance.now() - t0)))
      }
      setMode('reel')
      setPose('fly')
      setMood('happy')
      await wait(600)
    }

    const run = async () => {
      // Fly in from off-screen and wave hello.
      pilot.face(1)
      pilot.place({ x: -pilot.w, y: SH() * 0.78 })
      await frame()
      const hi = restSpot()
      await pilot.flyTo(hi.at, {
        via: [
          { x: SW() * 0.3, y: SH() * 0.62 },
          { x: SW() * 0.55, y: SH() * 0.72 },
          { x: SW() * 0.7, y: SH() * 0.45 },
        ],
        dur: 2600,
      })
      pilot.face(-1)
      setPose('wave')
      await wait(1300)
      setPose('fly')

      let round = 0
      let sceneIdx = 0
      if (startScene) {
        sceneIdx = SCENE_ORDER.indexOf(startScene)
        await playScene(SCENE_ORDER[sceneIdx++ % SCENE_ORDER.length])
      }
      for (;;) {
        const it = nextItem()
        if (variant === 'slots') await pullLever(it)
        else await classicSpin(it)
        await learnMore(it)
        round++
        if (round % cyclesPerScene === 0) await playScene(SCENE_ORDER[sceneIdx++ % SCENE_ORDER.length])
      }
    }

    run().catch((e) => {
      if (!(e instanceof AbortedError)) console.error('screensaver', e)
    })
    const coins = coinsRef.current
    return () => {
      ctl.abort()
      pilot.stop()
      coins?.clear()
    }
    // Restart the show only if the variant or motion preference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, reduced])

  const reel = (
    <Reel ref={reelRef} words={WORDS} initial={initialWord} lines={variant === 'slots' ? 3 : 1} reduced={reduced} />
  )
  const learnBtn = (
    <div ref={learnRef} className={`ss-btn ss-learn ${pressed === 'learn' ? 'is-pressed' : ''} ${spinning ? 'is-dim' : ''}`}>
      Learn more
    </div>
  )

  return (
    <div
      className={`ss-root ${landscape ? 'is-landscape' : 'is-portrait'} ${reduced ? 'is-reduced' : ''} ss-v-${variant}`}
      onClick={onExit}
      role="button"
      aria-label="Screensaver. Touch anywhere to return to the Launchpad."
    >
      <Backdrop />

      <header className="ss-frame-top">
        <span className="ss-elbow">
          <span className="ss-elbow-mark" />
          Temporal
        </span>
        <span className="ss-fill">Durable execution for every mission</span>
        <span className="ss-cap" />
      </header>

      <main className={`ss-stage ss-mode-${mode}`}>
        <section className="ss-show">
          {variant === 'slots' ? (
            <SlotMachine
              ref={slotRef}
              reel={reel}
              before={HEADLINE.before}
              after={HEADLINE.after}
              button={learnBtn}
              jackpot={jackpot}
              spinning={spinning}
            />
          ) : (
            <div ref={headRef} className={`ss-headline ${spinning ? 'is-spinning' : ''}`}>
              <div className="ss-head-line">{HEADLINE.before}</div>
              <div className="ss-head-reel">
                {landed > 0 && <span key={landed} className="ss-land-flash" />}
                {reel}
              </div>
              <div className="ss-head-line">{HEADLINE.after}</div>
              <div className="ss-head-btn">{learnBtn}</div>
            </div>
          )}
          <div className="ss-card-slot">
            <InfoCard item={item} open={cardOpen} cardRef={cardRef} doneRef={doneRef} donePressed={pressed === 'done'} />
          </div>
        </section>
        {mode === 'scene' && (
          <section className="ss-scene-layer">
            <Scene id={sceneId} step={sceneStep} />
          </section>
        )}
      </main>

      <footer className="ss-frame-bottom">
        <span className="ss-cap left" />
        <span className="ss-touch">{FOOTER}</span>
        <span className="ss-cap" />
      </footer>

      <Coins ref={coinsRef} />

      <div ref={ziggyRef} className="ss-ziggy" data-thrust="idle">
        <div ref={flipRef} className="ss-ziggy-flip">
          <Ziggy pose={pose} mood={mood} />
        </div>
      </div>
    </div>
  )
}

function InfoCard({
  item,
  open,
  cardRef,
  doneRef,
  donePressed,
}: {
  item: ReelItem
  open: boolean
  cardRef: React.RefObject<HTMLDivElement | null>
  doneRef: React.RefObject<HTMLDivElement | null>
  donePressed: boolean
}) {
  const [left, setLeft] = useState(READ_MS / 1000)
  useEffect(() => {
    if (!open) return
    const t0 = Date.now()
    setLeft(READ_MS / 1000)
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((READ_MS - (Date.now() - t0)) / 1000))), 250)
    return () => clearInterval(id)
  }, [open, item])
  return (
    <div ref={cardRef} className={`ss-card ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="ss-card-cap" />
      <div className="ss-card-main">
        <div className="ss-card-kicker">How Temporal helps with</div>
        <div className="ss-card-title">{item.word}</div>
        <p className="ss-card-blurb">{item.blurb}</p>
        <div className="ss-card-tags">
          {item.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="ss-card-foot">
          <div className="ss-card-timer">
            <div className="ss-card-bar">
              {open && <i key={item.word} style={{ animationDuration: `${READ_MS}ms` }} />}
            </div>
            <span>{left}s</span>
          </div>
          <div ref={doneRef} className={`ss-btn ss-done ${donePressed ? 'is-pressed' : ''}`}>
            Done
          </div>
        </div>
      </div>
    </div>
  )
}
