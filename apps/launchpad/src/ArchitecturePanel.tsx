import { useId } from 'react'
import { type TacoExecution, type TacoPhase } from './tacoExecution'
import { architectureProfiles } from './architectureProfiles'

/** Highlight app-reported phases when execution events are available. */
export function ArchitecturePanel({ demoId, execution, phase }: {demoId:string;execution?:TacoExecution|null;phase?:TacoPhase}) {
  const id=useId()
  const profile=architectureProfiles[demoId]
  if(!profile)return <p>Architecture information is not available for this demo.</p>
  const nodes=[
    {x:10,y:12,label:profile.entry}, {x:275,y:12,label:profile.api},
    {x:540,y:12,label:['Temporal','Workflow history + tasks']},
    {x:540,y:192,label:profile.worker}, {x:275,y:192,label:profile.work},
    {x:10,y:192,label:profile.systems},
  ]
  const taco=demoId==='tacos'
  const active=taco && execution?.mode==='temporal' && execution.orderId?({order:[0,1,2,3,4],kitchen:[2,3,4,5],ready:[2,3,5],finish:[0,2,3,4,5],recovery:[2,3,4,5]}[phase || 'order']):[]
  if(taco && phase==='ready') {
    nodes[3].label=['Order Workflow','Waiting for ready Signal']
    nodes[5].label=['Kitchen','Human marks order ready']
  }
  return <div className="architecture-story">
    <p className="eyebrow">{taco && execution?.mode==='traditional'?'DIRECT CALLS · WORKFLOW NOT RUNNING':taco?'ORDER PHASES · FROM APPLICATION EVENTS':'ILLUSTRATED LOGICAL FLOW · NOT LIVE TELEMETRY'}</p>
    <svg className="stage-architecture demo-architecture" viewBox="0 0 780 300" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>How this demo uses Temporal</title>
      <desc id={`${id}-description`}>{profile.explanation} Workers obtain tasks from Temporal and report results. The animation illustrates logical flow, not execution timing.</desc>
      <defs><marker id={`${id}-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7" fill="var(--brand-highlight)" /></marker></defs>
      <g className="architecture-links" fill="none" stroke="var(--brand-highlight)" strokeWidth="2" markerEnd={`url(#${id}-arrow)`}>
        <path d="M230 55H270"/><path d="M495 55H535"/>
        <path d="M650 192V105" markerStart={`url(#${id}-arrow)`}/>
        <path d="M540 235H500"/><path d="M275 235H235"/>
      </g>
      <text className="architecture-poll-label" x="637" y="141" textAnchor="end">Tasks / results</text>
      <text className="architecture-poll-label" x="637" y="160" textAnchor="end">Workers obtain tasks</text>
      {nodes.map(({x,y,label},index)=><g className={active.includes(index)?'execution-node-active':undefined} key={`${x}-${y}`} transform={`translate(${x},${y})`}>
        <rect width="220" height="88" rx="4" />
        <text x="110" y="36" textAnchor="middle" className="architecture-node-title">{label[0]}</text>
        <text x="110" y="61" textAnchor="middle" className="architecture-node-detail">{label[1]}</text>
      </g>)}
    </svg>
    <p className="architecture-explanation">{profile.explanation}</p>
  </div>
}
