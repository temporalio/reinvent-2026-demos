import { useEffect, useRef, useState } from 'react'

type MonitorOptions = {
  rootDocument:Document
  onCountdown:(seconds:number|null)=>void
  onTimeout:()=>void
  now?:()=>number
  schedule?:(callback:()=>void)=>()=>void
  idleMs?:number
  countdownMs?:number
}

/** Staff controls, Holodeck selection, and running Holodeck demos stay manual. */
export function idleScreensaverEnabled(screen:string,demoId:string|undefined,running:boolean,staffOpen:boolean,filter:string='all'):boolean {
  return screen!=='screensaver' && !staffOpen && !(screen==='missions' && filter==='holodeck') && !(screen==='demo' && running && (demoId==='flight-simulator' || demoId==='photo-booth'))
}

/** Return one navigation step at a time; each mounted screen starts a fresh clock. */
export function idleNavigationTarget(screen:string,demoId:string|undefined,running:boolean,staffOpen:boolean,filter:string='all'):'missions'|'screensaver'|null {
  if(!idleScreensaverEnabled(screen,demoId,running,staffOpen,filter))return null
  return screen==='demo'?'missions':'screensaver'
}

/** The final five seconds of each screen’s idle window display a warning. */
export function idleDelayForScreen(screen:string):number {
  return screen==='missions'?55_000:screen==='crew'?30_000:25_000
}

/** Watch user input in the host and every reachable same-origin iframe document. */
export function createIdleMonitor({rootDocument,onCountdown,onTimeout,now=Date.now,schedule,idleMs=30_000,countdownMs=5_000}:MonitorOptions):()=>void {
  let deadline=now()+idleMs
  let lastScan=-Infinity
  let previous:number|null=null
  let stopped=false
  const documents=new Map<Document,()=>void>()
  function report(value:number|null) {if(previous!==value){previous=value;onCountdown(value)}}
  function activity(event:Event) {
    if(stopped)return
    if(event.type==='pointermove') {
      const pointer=event as PointerEvent
      if(!pointer.buttons && pointer.pointerType!=='touch')return
    }
    deadline=now()+idleMs
    report(null)
  }
  const inputs=['pointerdown','pointermove','touchstart','keydown','wheel','input']
  function scan() {
    if(stopped)return
    const reachable=new Set<Document>()
    function visit(doc:Document) {
      if(reachable.has(doc))return
      reachable.add(doc)
      if(!documents.has(doc)) {
        for(const type of inputs)doc.addEventListener(type,activity,{capture:true,passive:true})
        doc.addEventListener('load',scan,true)
        documents.set(doc,()=>{
          for(const type of inputs)doc.removeEventListener(type,activity,{capture:true})
          doc.removeEventListener('load',scan,{capture:true})
        })
      }
      for(const frame of doc.querySelectorAll('iframe')) {
        try {if(frame.contentDocument)visit(frame.contentDocument)} catch {/* Cross-origin frames do not expose their documents. */}
      }
    }
    visit(rootDocument)
    for(const [doc,remove] of documents)if(!reachable.has(doc)){remove();documents.delete(doc)}
  }
  function stop() {
    if(stopped)return
    stopped=true
    cancel()
    for(const remove of documents.values())remove()
    documents.clear()
  }
  function tick() {
    if(stopped)return
    const current=now()
    if(current-lastScan>=1000){lastScan=current;scan()}
    const remaining=deadline+countdownMs-current
    if(remaining<=0){report(null);stop();onTimeout();return}
    report(current>=deadline?Math.ceil(remaining/1000):null)
  }
  scan()
  const cancel=(schedule || (callback=>{const timer=window.setInterval(callback,250);return ()=>window.clearInterval(timer)}))(tick)
  return stop
}

export function useIdleScreensaver({enabled,onTimeout,idleMs=30_000,countdownMs=5_000,scope}:{enabled:boolean;onTimeout:()=>void;idleMs?:number;countdownMs?:number;scope?:string}):number|null {
  const [remaining,setRemaining]=useState<number|null>(null)
  const callback=useRef(onTimeout)
  callback.current=onTimeout
  useEffect(()=>{
    setRemaining(null)
    if(!enabled)return
    return createIdleMonitor({rootDocument:document,onCountdown:setRemaining,onTimeout:()=>callback.current(),idleMs,countdownMs})
  },[enabled,idleMs,countdownMs,scope])
  return enabled?remaining:null
}
