import { useEffect, useRef, useState, type ReactNode } from 'react'

const bounded = (value: number) => Math.min(1.75, Math.max(.75, value))

/** Zoom belongs to this panel; native one-finger scrolling remains available. */
export function PanelViewport({ label, children }: { label: string; children: ReactNode }) {
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const root = useRef<HTMLDivElement>(null)
  function update(value: number) {
    zoomRef.current = bounded(value)
    setZoom(zoomRef.current)
  }
  useEffect(() => {
    const element = root.current
    if (!element) return
    let gesture: { distance: number; zoom: number } | null = null
    function distance(touches: TouchList) {
      return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    }
    function start(event: TouchEvent) {
      if (event.touches.length !== 2) { gesture = null; return }
      const initial = distance(event.touches)
      if (initial < 1) return
      gesture = { distance: initial, zoom: zoomRef.current }
      event.preventDefault()
    }
    function move(event: TouchEvent) {
      if (!gesture || event.touches.length !== 2) return
      event.preventDefault()
      update(gesture.zoom * distance(event.touches) / gesture.distance)
    }
    function end() { gesture = null }
    element.addEventListener('touchstart', start, { passive: false })
    element.addEventListener('touchmove', move, { passive: false })
    element.addEventListener('touchend', end)
    element.addEventListener('touchcancel', end)
    return () => {
      element.removeEventListener('touchstart', start)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', end)
      element.removeEventListener('touchcancel', end)
    }
  }, [])
  return <div className="panel-viewport" ref={root} data-panel={label}>
    <div className="panel-zoom" role="group" aria-label={`${label} zoom`}>
      <button onClick={() => update(zoom - .1)} disabled={zoom <= .75} aria-label={`Zoom out ${label}`}>−</button>
      <button onClick={() => update(1)} aria-label={`Reset ${label} zoom`}>{Math.round(zoom * 100)}%</button>
      <button onClick={() => update(zoom + .1)} disabled={zoom >= 1.75} aria-label={`Zoom in ${label}`}>+</button>
    </div>
    <div className="panel-scroll"><div className="panel-zoom-content" style={{ zoom }}>{children}</div></div>
  </div>
}
