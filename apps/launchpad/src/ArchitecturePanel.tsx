import {TravelArchitecture} from './TravelArchitecture'
import {NoRoadsArchitecture} from './NoRoadsArchitecture'
import type {LiveCursor} from './workflowHistory'
import { useId } from 'react'
import { type TacoExecution, type TacoPhase } from './tacoExecution'
import { architectureProfiles } from './architectureProfiles'

/** Highlight app-reported phases when execution events are available. */
export function ArchitecturePanel({ demoId, execution, phase,cursor }: {demoId:string;execution?:TacoExecution|null;phase?:TacoPhase;cursor?:LiveCursor|null}) {
  const id=useId()
  const profile=architectureProfiles[demoId]
  if(demoId==='agent-harness')return <TravelArchitecture cursor={cursor} id={id} />
  if(demoId==='no-roads')return <NoRoadsArchitecture cursor={cursor} id={id} />
  if(demoId==='data-pipeline')return <PipelineArchitecture cursor={cursor} id={id} />
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


function PipelineArchitecture({cursor,id}:{cursor?:LiveCursor|null;id:string}) {
 const nodes=[['info.json','Namespace manifest'],['Validate','Accept or reject input'],['Extract','Copy to selected worker'],['Transform','Namespace entries to CSV'],['Load','Job key prevents duplicates'],['Confirm completion','Poll, Signal, or Update'],['info.csv','Loaded output'],['Temporal','Durable history + retries']]
 const positions=[[10,55],[235,55],[460,55],[685,55],[685,235],[460,235],[235,235],[10,235]]
 const active=cursor?({get_available_task_queue:7,validate:1,extract:2,transform:3,bug:3,recovery:7,load:4,poll:5,signal:5,update:5,complete:6} as Record<string,number>)[cursor.step]:undefined
 const moving=cursor && ['running','retrying'].includes(cursor.status)
 return <div className="architecture-story pipeline-architecture">
  <p className="eyebrow">{cursor?`RECORDED JOB STEP / ${cursor.step} / ${cursor.status}${cursor.stale?' / UPDATES INTERRUPTED':''}`:'PIPELINE / INPUT TO LOADED OUTPUT'}</p>
  <svg className="stage-architecture demo-architecture" viewBox="0 0 900 365" role="img" aria-labelledby={`${id}-pipeline-title`}>
   <title id={`${id}-pipeline-title`}>Pipeline workers validate a namespace manifest, extract it, transform JSON into CSV, load once, and confirm completion</title>
   <defs><marker id={`${id}-pipeline-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="var(--brand-highlight)" /></marker></defs>
   <text x="450" y="24" textAnchor="middle" className="architecture-node-detail">Temporal schedules Activities on the selected worker and records their results.</text>
   {['M205 98H230','M430 98H455','M655 98H680','M782 145V230','M685 278H660','M460 278H435','M235 278H210'].map((path,i)=><path key={path} d={path} className={moving && active===i+1?'architecture-links pipeline-link-active':'pipeline-link'} fill="none" stroke="var(--brand-highlight)" strokeWidth="2" markerEnd={`url(#${id}-pipeline-arrow)`}/>)}
   {nodes.map((label,i)=><g key={label[0]} transform={`translate(${positions[i][0]},${positions[i][1]})`} className={active===i?'execution-node-active':''} data-stage={i} data-status={active===i?cursor?.status:undefined}>
    <rect width="195" height="90" rx="0"/><text x="97" y="35" textAnchor="middle" className="architecture-node-title">{label[0]}</text><text x="97" y="62" textAnchor="middle" className="architecture-node-detail">{label[1]}</text>
   </g>)}
  </svg>
  <p className="architecture-explanation">The workflow selects a worker queue so extraction, transformation, and loading share local files. Completed Activities remain recorded during retries. Human checkpoints wait for a Signal or Update after loading.</p>
 </div>
}
