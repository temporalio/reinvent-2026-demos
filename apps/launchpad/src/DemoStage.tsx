import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import catalog from './catalog.json'
import './stage.css'
import { CodeSamples } from './CodeSamples'
import { workflowTarget } from './workflowNavigation'

type Tab = 'business' | 'architecture' | 'code' | 'temporal'
const tabs: { id: Tab; label: string }[] = [
  {id:'business',label:'Business impact'}, {id:'architecture',label:'Architecture'},
  {id:'code',label:'Workflow code'}, {id:'temporal',label:'Temporal UI'},
]
const stories: Record<string, [string,string,string]> = {
  tacos: ['Deliver every order, even through a failure.', 'Temporal keeps the order progressing across payment, preparation, and delivery.', 'Try a failure, restore the service, and follow recovery in the Workflow history.'],
  'money-transfer': ['Move credits with confidence.', 'A transfer coordinates account changes through a durable Workflow.', 'Compare the configured failure scenarios and follow recovery in the Workflow history.'],
  'data-pipeline': ['Keep the cargo pipeline moving.', 'A Workflow tracks a multi-step data job and its progress.', 'Try the signal, update, or failure scenarios to explore recovery without starting the story over.'],
  loan: ['Coordinate a decision from application to review.', 'Loan underwriting combines agent work, specialist tools, and human decisions.', 'Model inference still needs a working provider; local storage emulation does not replace it.'],
  'no-roads': ['Absorb work when demand changes.', 'Temporal queues durable work while workers process the backlog.', 'Lambda scaling is a hosted capability. A local worker is not a Lambda scaling test.'],
  'agent-harness': ['Keep an agent’s journey durable.', 'Temporal coordinates agent execution and tool calls.', 'This demo needs model access; a browser preview alone does not verify inference.'],
  'agentic-sdlc': ['Carry a change through the delivery process.', 'Durable orchestration coordinates the coding and review pipeline.', 'Use the booth sandbox repository and scoped credentials before enabling this demo.'],
  'flight-simulator': ['Take the controls. Follow the mission.', 'The simulator combines interactive flight with backend Workflow execution.', 'The live flight display and Workflow history show different parts of the experience.'],
  'photo-booth': ['Turn a booth visit into a keepsake.', 'A Workflow coordinates photo processing and delivery.', 'Local preview uses mock image generation and an email outbox. It does not send attendee emails.'],
}

export function DemoStage({ demo, persona, temporalUi, notice }: {demo:(typeof catalog)[number];persona:string;temporalUi:string|null;notice?:string}) {
  const initialTab: Tab = persona.toLowerCase() === 'mech' ? 'code' : persona.toLowerCase() === 'envoy' ? 'architecture' : 'business'
  const [tab,setTab] = useState<Tab>(initialTab)
  const [workflowUrl,setWorkflowUrl] = useState<string|null>(null)
  const appFrame = useRef<HTMLIFrameElement>(null)
  useEffect(()=>{
    function focusWorkflow(event:MessageEvent) {
      if(event.origin!==window.location.origin || event.source!==appFrame.current?.contentWindow || event.data?.type!=='booth:workflow' || typeof event.data.url!=='string' || !temporalUi)return
      const url=workflowTarget(event.data.url,temporalUi,window.location.origin)
      if(url) {setWorkflowUrl(url); if(event.data.activate===true) {setTab('temporal'); buttons.current[3]?.focus()}}
    }
    window.addEventListener('message',focusWorkflow); return ()=>window.removeEventListener('message',focusWorkflow)
  },[temporalUi])
  const id = useId()
  const buttons = useRef<(HTMLButtonElement|null)[]>([])
  const story = stories[demo.id]
  function navigate(event:KeyboardEvent<HTMLDivElement>) {
    const current=tabs.findIndex(t=>t.id===tab)
    const index = event.key==='ArrowRight' ? (current+1)%4 : event.key==='ArrowLeft' ? (current+3)%4 : event.key==='Home' ? 0 : event.key==='End' ? 3 : -1
    if(index<0)return
    event.preventDefault(); setTab(tabs[index].id); buttons.current[index]?.focus()
  }
  return <div className="demo-stage">
    <section className="stage-application" aria-label="Live demo interaction and controls">
      <div className="app-viewport"><iframe ref={appFrame} title={`${demo.title}: live interaction and controls`} src={`${demo.path}?persona=${persona.toLowerCase()}&booth=1&sharedStage=1`} allow="camera; fullscreen" /></div>
    </section>
    <section className="stage-information" aria-label="Under the hood">
      <div className="stage-heading"><span>UNDER THE HOOD</span><span>{persona.toUpperCase()}</span></div>
      <div role="tablist" aria-label="Demo information" className="stage-tabs" onKeyDown={navigate}>{tabs.map((t,index)=><button key={t.id} ref={element=>{buttons.current[index]=element}} id={`${id}-${t.id}`} role="tab" aria-selected={tab===t.id} aria-controls={`${id}-panel-${t.id}`} tabIndex={tab===t.id?0:-1} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
      {tabs.map(t=><div key={t.id} id={`${id}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${id}-${t.id}`} tabIndex={0} hidden={tab!==t.id} className="stage-tab-content">
        {t.id==='business' && <div className="business-story"><h2>{story?.[0]}</h2><p>{story?.[1]}</p><p className="business-detail">{notice || story?.[2]}</p></div>}
        {t.id==='architecture' && <div className="architecture-story"> <p className="eyebrow">DEPLOYMENT OVERVIEW · NOT LIVE TELEMETRY</p><svg className="stage-architecture" viewBox="0 0 760 270" role="img" aria-label="The demo browser calls its API. The API starts a Workflow in Temporal. Workers poll Temporal and execute the demo's work."><defs><marker id={`${id}-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="var(--brand-highlight)" /></marker></defs><g fill="none" stroke="var(--brand-highlight)" strokeWidth="2" markerEnd={`url(#${id}-arrow)`}><path d="M180 75H270"/><path d="M450 75H540"/><path d="M630 115V180H450"/></g>{[[0,35,'Demo browser'],[270,35,'Demo API'],[540,35,'Temporal'],[270,155,'Worker / activities']].map(([x,y,label])=><g key={String(label)} transform={`translate(${x},${y})`}><rect width="180" height="80" rx="4"/><text x="90" y="46" textAnchor="middle">{label}</text></g>)}</svg></div>}
        {t.id==='code' && <CodeSamples demoId={demo.id} />}
        {t.id==='temporal' && (temporalUi ? <iframe title={`${demo.title}: Temporal workflow history`} src={workflowUrl || temporalUi} className="stage-temporal" /> : <p>The hosted Temporal UI route has not been enabled for this project. Local preview connects this tab to Temporal OSS.</p>)}
      </div>)}
    </section>
  </div>
}
