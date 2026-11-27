import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import catalog from './catalog.json'
import {businessStories as stories} from './businessImpact'
import './stage.css'
import {demoWorkflowList} from './demoWorkflowList'
import {historyCursor,workflowApi,type LiveCursor,type HistoryEvent} from './workflowHistory'
import {readDemoExecution} from './demoExecution'
import { CodeSamples } from './CodeSamples'
import { readMoneyExecution, type MoneyExecution } from './moneyExecution'
import { ExecutionProgress } from './ExecutionProgress'
import { readTacoExecution, displayedTacoPhase, type TacoExecution, type PhaseSelection } from './tacoExecution'
import { ArchitecturePanel } from './ArchitecturePanel'
import { workflowTarget } from './workflowNavigation'
import { preferDarkTemporalUi, showInTemporalFrame, styleTemporalFrame } from './temporalFrame'

type Tab = 'business' | 'architecture' | 'code' | 'temporal'
const tabs: { id: Tab; label: string }[] = [
  {id:'business',label:'Business impact'}, {id:'architecture',label:'Architecture'},
  {id:'code',label:'Workflow code'}, {id:'temporal',label:'Temporal UI'},
]


export function DemoStage({ demo, persona, temporalUi, temporalZoom=100, stationId, notice, onPlaybackChange }: {demo:(typeof catalog)[number];persona:string;temporalUi:string|null;temporalZoom?:number;stationId?:string;notice?:string;onPlaybackChange?:(playing:boolean)=>void}) {
  const [photoResult,setPhotoResult]=useState(false)
  const [flightResult,setFlightResult]=useState(false)
  const holodeck = (demo.id==='flight-simulator' && !flightResult) || (demo.id==='photo-booth' && !photoResult)
  useEffect(()=>{
    function stage(event:MessageEvent){
      if(demo.id==='flight-simulator' && event.origin===location.origin && event.source===appFrame.current?.contentWindow && event.data?.type==='booth:flightsim-stage' && typeof event.data.result==='boolean')setFlightResult(event.data.result)
      if(demo.id==='photo-booth' && event.origin===location.origin && event.source===appFrame.current?.contentWindow && event.data?.type==='booth:photobooth-stage' && typeof event.data.result==='boolean')setPhotoResult(event.data.result)
    }
    window.addEventListener('message',stage);return()=>window.removeEventListener('message',stage)
  },[demo.id])
  const [workflowOverlay,setWorkflowOverlay]=useState<string|null>(null)
  const initialTab: Tab = persona.toLowerCase() === 'mech' ? 'code' : persona.toLowerCase() === 'envoy' ? 'architecture' : 'business'
  const [tab,setTab] = useState<Tab>(initialTab)
  const appFrame = useRef<HTMLIFrameElement>(null)
  const temporalFrame = useRef<HTMLIFrameElement>(null)
  const lastWorkflow = useRef<string|null>(null)
  // UI startup can redirect a proxy root to its namespace. Scope that list and
  // later SPA returns to it, while leaving exact-run navigation untouched.
  useEffect(()=>{
    const apply=()=>{
      const frame=temporalFrame.current
      try{const current=frame?.contentDocument?.location.href;if(!frame||!current||current==='about:blank')return;const scoped=demoWorkflowList(current,demo.id,location.origin);if(scoped!==current)showInTemporalFrame(frame,scoped)}catch{/* UI has not loaded yet. */}
    }
    const timer=setInterval(apply,500);apply();return()=>clearInterval(timer)
  },[demo.id])
  const [workflowUrl,setWorkflowUrl]=useState<string|null>(null)
  const [nativeCursor,setNativeCursor]=useState<LiveCursor|null>(null)
  const [recordedCursor,setRecordedCursor]=useState<LiveCursor|null>(null)
  const selectedRunId=workflowUrl?.split('/workflows/')[1]?.split('/')[1]
  const nativeMatches=nativeCursor?.runId===selectedRunId
  const specialists=demo.id==='loan' && recordedCursor?.status==='running' && ['FraudIdentityAgent','EmploymentVerificationAgent'].includes(recordedCursor.step)
  const liveCursor=nativeMatches && !specialists?nativeCursor:recordedCursor
  useEffect(()=>{
    function progress(event:MessageEvent){
      if(event.source===appFrame.current?.contentWindow && event.origin===location.origin && event.data?.type==='booth:demo-reset' && event.data.demoId===demo.id){setNativeCursor(null);setRecordedCursor(null);setWorkflowUrl(null);return}
      const next=readDemoExecution(event,location.origin,appFrame.current?.contentWindow||null,demo.id);if(next)setNativeCursor(next)}
    window.addEventListener('message',progress);return()=>window.removeEventListener('message',progress)
  },[demo.id])
  useEffect(()=>{
    if(!workflowUrl || ['money-transfer','tacos'].includes(demo.id))return
    const api=workflowApi(workflowUrl,location.origin)
    if(!api)return
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;setRecordedCursor(null)
    async function poll(){
      try{
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(10_000)])
        let next:string|undefined,events:HistoryEvent[]=[]
        do{const response=await fetch(api+(next?'&nextPageToken='+encodeURIComponent(next):''),{signal});if(!response.ok)throw Error('History unavailable');const data=await response.json();events.push(...(data.history?.events||[]));next=data.nextPageToken}while(next)
        const cursor=historyCursor(events,new URL(workflowUrl!,location.origin).pathname.split('/workflows/')[1].split('/')[1])
        if(cursor)setRecordedCursor(cursor)
        if(cursor?.terminal)return
      }catch{if(!controller.signal.aborted)setRecordedCursor(previous=>previous?{...previous,stale:true}:null)}
      if(!controller.signal.aborted)timer=setTimeout(poll,2000)
    }
    void poll();return()=>{controller.abort();clearTimeout(timer)}
  },[workflowUrl,demo.id])
  // Layout effects run in the commit that inserts the iframe, before its document can boot.
  useLayoutEffect(()=>{ if(temporalUi)preferDarkTemporalUi() },[temporalUi])
  useEffect(()=>{
    function focusWorkflow(event:MessageEvent) {
      if(event.origin!==window.location.origin || event.source!==appFrame.current?.contentWindow || event.data?.type!=='booth:workflow' || typeof event.data.url!=='string' || !temporalUi)return
      const url=workflowTarget(event.data.url,temporalUi,window.location.origin)
      if(!url)return
      const activate=event.data.activate===true
      setWorkflowUrl(url)
      if(holodeck && demo.id!=='photo-booth') {
        // Live flight has no lower panel yet. Preserve the running game
        // beneath a bounded workflow view when staff inspect it.
        if(activate)setWorkflowOverlay(url)
        return
      }
      // A repeated background announcement must not pull the panel away from where the visitor browsed.
      if(temporalFrame.current && (activate || url!==lastWorkflow.current))showInTemporalFrame(temporalFrame.current,url,{resetScroll:activate})
      lastWorkflow.current=url
      if(activate) {setTab('temporal'); buttons.current[3]?.focus()}
    }
    window.addEventListener('message',focusWorkflow); return ()=>window.removeEventListener('message',focusWorkflow)
  },[temporalUi,holodeck,demo.id])
  const [moneyRun,setMoneyRun]=useState<MoneyExecution|null>(null)
  useEffect(()=>{
    if(demo.id!=='money-transfer')return
    function progress(event:MessageEvent) {
      const next=readMoneyExecution(event,window.location.origin,appFrame.current?.contentWindow || null)
      if(next)setMoneyRun(next)
    }
    window.addEventListener('message',progress)
    return ()=>window.removeEventListener('message',progress)
  },[demo.id])
  const [tacoRun,setTacoRun]=useState<TacoExecution|null>(null)
  const [phaseSelection,setPhaseSelection]=useState<PhaseSelection>(null)
  useEffect(()=>{
    if(demo.id!=='tacos')return
    function progress(event:MessageEvent) {
      const next=readTacoExecution(event,window.location.origin,appFrame.current?.contentWindow || null)
      if(next)setTacoRun(next)
    }
    window.addEventListener('message',progress)
    return ()=>window.removeEventListener('message',progress)
  },[demo.id])
  const phase=displayedTacoPhase(tacoRun,phaseSelection)
  const following=!phaseSelection || phaseSelection.orderId!==tacoRun?.orderId
  const id = useId()
  const buttons = useRef<(HTMLButtonElement|null)[]>([])
  const story = stories[demo.id]
  function navigate(event:KeyboardEvent<HTMLDivElement>) {
    const current=tabs.findIndex(t=>t.id===tab)
    const index = event.key==='ArrowRight' ? (current+1)%4 : event.key==='ArrowLeft' ? (current+3)%4 : event.key==='Home' ? 0 : event.key==='End' ? 3 : -1
    if(index<0)return
    event.preventDefault(); setTab(tabs[index].id); buttons.current[index]?.focus()
  }
  if(demo.kind==='video')return <section className="video-stage" aria-label="Cornelia Davis AgentCore video">
    <video controls autoPlay muted playsInline preload="metadata" poster="/agentcore-video/poster.jpg" controlsList="nodownload noremoteplayback" disablePictureInPicture
      onPlay={()=>onPlaybackChange?.(true)} onPause={()=>onPlaybackChange?.(false)} onEnded={()=>onPlaybackChange?.(false)} onError={()=>onPlaybackChange?.(false)}
      onVolumeChange={event=>{if(!event.currentTarget.muted)event.currentTarget.muted=true;if(event.currentTarget.volume!==0)event.currentTarget.volume=0}}>
      <source src="/agentcore-video/CD_AgentCoreDemo.mp4" type="video/mp4" />
      Your browser cannot play this video.
    </video>
  </section>
  return <div className={`demo-stage${holodeck?' demo-stage-holodeck':''}`}>
    <section className="stage-application" aria-label="Live demo interaction and controls" inert={!!workflowOverlay} aria-hidden={workflowOverlay?true:undefined}>
      <div className="app-viewport"><iframe ref={appFrame} title={`${demo.title}: live interaction and controls`} src={`${demo.path}?persona=${persona.toLowerCase()}&booth=1&sharedStage=1${stationId?`&station=${encodeURIComponent(stationId)}`:""}`} allow="camera; fullscreen" /></div>
    </section>
    {holodeck && workflowOverlay && <section className="holodeck-workflow" aria-label={`${demo.title} workflow`}>
      <header><button autoFocus onClick={()=>setWorkflowOverlay(null)}>← Back to {demo.id==='photo-booth'?'Photo Booth':demo.id==='agentcore-research'?'AgentCore Starship Engineer':'Flight Simulator'}</button><span>Temporal workflow</span></header>
      <iframe title={`${demo.title}: Temporal workflow history`} src={workflowOverlay} onLoad={event=>styleTemporalFrame(event.currentTarget)} />
    </section>}
    {!holodeck && <section className="stage-information" aria-label="Under the hood">
      <div className="stage-heading"><span>UNDER THE HOOD</span><span>{persona.toUpperCase()}</span></div>
      <div role="tablist" aria-label="Demo information" className="stage-tabs" onKeyDown={navigate}>{tabs.map((t,index)=><button key={t.id} ref={element=>{buttons.current[index]=element}} id={`${id}-${t.id}`} role="tab" aria-selected={tab===t.id} aria-controls={`${id}-panel-${t.id}`} tabIndex={tab===t.id?0:-1} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
      {demo.id==='tacos' && (tab==='architecture' || tab==='code') && <ExecutionProgress run={tacoRun} phase={phase} following={following} onSelect={phase=>setPhaseSelection({orderId:tacoRun?.orderId || null,phase})} onFollow={()=>setPhaseSelection(null)} />}
      {tabs.map(t=><div key={t.id} id={`${id}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${id}-${t.id}`} tabIndex={0} hidden={tab!==t.id} className="stage-tab-content">
        {t.id==='business' && <div className="business-story"><h2>{story?.headline}</h2><p>{story?.summary}</p><ul className="business-use-cases">{story?.bullets.map(point=><li key={point.label}><strong>{point.label}.</strong> {point.text}</li>)}</ul><p className="business-detail">{notice || story?.detail}</p></div>}
        {t.id==='architecture' && tab==='architecture' && <ArchitecturePanel demoId={demo.id} execution={tacoRun} phase={phase} cursor={liveCursor} />}
        {t.id==='code' && <CodeSamples demoId={demo.id} execution={tacoRun} phase={phase} money={moneyRun} cursor={liveCursor} />}
        {t.id==='temporal' && (temporalUi ? <div className="temporal-viewport"><iframe ref={temporalFrame} title={`${demo.title}: Temporal workflow history`} src={workflowUrl || demoWorkflowList(temporalUi,demo.id,location.origin)} onLoad={event=>styleTemporalFrame(event.currentTarget)} className="stage-temporal" style={{zoom:temporalZoom/100}} /></div> : <p>The hosted Temporal UI route has not been enabled for this project. Local preview connects this tab to Temporal OSS.</p>)}
      </div>)}
    </section>}
  </div>
}
