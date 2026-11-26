import { useEffect, useRef, useState, type ReactNode } from 'react'
import {displayRectangle} from './displayGeometry'
import type { DisplaySettings } from './stationControl'

/** Keep the saved demo rectangle inside the frame without remounting its app. */
export function DisplayArea({ display, children, mode = 'browse' }: {display:DisplaySettings;children:ReactNode;mode?:'demo'|'browse'|'crew'|'missions'|'video'}) {
  const bounds = useRef<HTMLDivElement>(null)
  const [size,setSize] = useState({width:0,height:0})
  useEffect(() => {
    const element=bounds.current
    if(!element)return
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}))
    observer.observe(element)
    return ()=>observer.disconnect()
  },[])
  const {offsetX:x,offsetY:y}=displayRectangle(display,size)
  return <div ref={bounds} className="presentation-bounds" data-testid="presentation-bounds">
    <main className={`station-surface station-surface-${mode}`} data-testid="station-surface" style={{width:`${display.width}%`,height:`${display.height}%`,transform:`translate(-50%, -50%) translate(${x}px, ${y}px)`}}>
      <div className="station-content" style={mode !== 'browse' ? {transform:`scale(${display.zoom/100})`,transformOrigin:'top left',height:`${10000/display.zoom}%`,width:`${10000/display.zoom}%`} : {zoom:display.zoom/100,minHeight:`${10000/display.zoom}%`,width:`${10000/display.zoom}%`}}>{children}</div>
    </main>
  </div>
}
