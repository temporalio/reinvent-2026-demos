import {useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {displayRectangle} from './displayGeometry'
import type {DisplaySettings} from './stationControl'

type Bounds={left:number;top:number;width:number;height:number}

/** Draw the draft at its real screen coordinates without covering the controls. */
export function DisplayOutline({display}:{display:DisplaySettings;label:string}) {
 const shell=useRef<HTMLDivElement>(null)
 const [bounds,setBounds]=useState<Bounds|null>(null)
 useLayoutEffect(()=>{
  // Ziggy opens controls over a live launchpad. /config needs a measurement-only
  // copy of its header/footer spacing, without mounting a demo or its iframe.
  const live=[...document.querySelectorAll<HTMLElement>('.launchpad > .presentation-bounds')].find(node=>!node.closest('[data-outline-shell]'))
  const element=live??shell.current?.querySelector<HTMLElement>('.presentation-bounds')
  if(!element)return
  const measure=()=>{
   const {left,top,width,height}=element.getBoundingClientRect()
   setBounds(previous=>previous&&previous.left===left&&previous.top===top&&previous.width===width&&previous.height===height?previous:{left,top,width,height})
  }
  const observer=new ResizeObserver(measure)
  observer.observe(element)
  window.addEventListener('resize',measure)
  measure()
  return()=>{observer.disconnect();window.removeEventListener('resize',measure)}
 },[])
 const rect=bounds?displayRectangle(display,bounds):null
 return createPortal(<>
  <div ref={shell} className="launchpad control-outline-shell" data-outline-shell aria-hidden="true" inert>
   <header><img src="/assets/brand/temporal-logo.svg" alt=""/><h1 className="demo-title">Demo</h1></header>
   <div className="presentation-bounds"/>
   <footer><button type="button">Crew</button><button type="button">All missions</button><button type="button">AI / AWS missions</button>{<div className="screensaver-control"><span className="idle-countdown"/><button type="button">Screensaver</button><button type="button" className="idle-toggle" aria-label="Pause automatic return timers">⌛</button></div>}<span className="connection-status" aria-hidden="true">⌁</span><button type="button" className="ziggy-settings"><img src="/assets/frame/ziggy-astronaut.png" alt=""/></button></footer>
  </div>
  {bounds&&rect&&<div className="control-screen-outline" data-testid="draft-panel-outline" aria-hidden="true" style={{left:bounds.left+rect.x,top:bounds.top+rect.y,width:rect.width,height:rect.height}}/>}
 </>,document.body)
}
