import {useState} from 'react'
import {displayRectangle} from './displayGeometry'
import type {DisplaySettings} from './stationControl'

/** Draft-only drawing: never loads a demo or sends control API writes. */
export function DisplayOutline({display,label}:{display:DisplaySettings;label:string}) {
 const [portrait,setPortrait]=useState(true)
 const bounds=portrait?{width:1080,height:1920}:{width:1920,height:1080}
 const rect=displayRectangle(display,bounds)
 const fontSize=Math.min(bounds.width,bounds.height)*.06
 return <figure className="control-display-outline" aria-label={`${label} unsaved panel layout`}>
  <figcaption><strong>Live layout preview</strong><span>Red outline: your draft demo panel</span></figcaption>
  <div className="control-choice" role="group" aria-label="Preview reference orientation"><button type="button" aria-pressed={portrait} onClick={()=>setPortrait(true)}>Portrait</button><button type="button" aria-pressed={!portrait} onClick={()=>setPortrait(false)}>Landscape</button></div>
  <svg viewBox={`-12 -12 ${bounds.width+24} ${bounds.height+24}`} role="img" aria-label={`Panel ${display.width}% wide and ${display.height}% high, offset ${display.x} pixels horizontally and ${display.y} pixels vertically`}>
   <rect width={bounds.width} height={bounds.height} className="outline-reference"/>
   <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} className="outline-panel" vectorEffect="non-scaling-stroke" data-testid="draft-panel-outline"/>
   <line x1={rect.x} y1={rect.y+rect.height/2} x2={rect.x+rect.width} y2={rect.y+rect.height/2} className="outline-panel-divider" vectorEffect="non-scaling-stroke"/>
   <g textAnchor="middle" fontSize={fontSize}><text x={rect.x+rect.width/2} y={rect.y+rect.height/4}>Demo</text><text x={rect.x+rect.width/2} y={rect.y+rect.height*3/4}>Workflow view</text></g>
  </svg>
  <p>{display.width}% × {display.height}% · X {display.x}px · Y {display.y}px</p>
  <p>Content {display.zoom}% · Temporal UI {display.temporal_ui_zoom}%</p>
  <p className="control-muted">Reference area: {bounds.width} × {bounds.height}. Each station fits this layout within its own available screen area. Nothing changes on the stations until you save.</p>
 </figure>
}
