import {useEffect,useState} from 'react'
import type {LiveCursor} from './workflowHistory'

/** Deployment relationships are illustrative; only the selected Activity is live. */
export function NoRoadsArchitecture({cursor,id}:{cursor?:LiveCursor|null;id:string}) {
 const [mode,setMode]=useState<'native'|'lambda'|'unknown'>('unknown')
 useEffect(()=>{
  const controller=new AbortController()
  void fetch('/no-roads/api/runtime',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(runtime=>{
   if(runtime?.lambda===false)setMode('native')
   if(runtime?.lambda===true)setMode('lambda')
  }).catch(()=>{})
  return()=>controller.abort()
 },[])
 const arrow=`url(#${id}-roads-arrow)`,control=`url(#${id}-roads-control)`
 const stages=[['ProcessSubmission','Validate + greet'],['SimulateWork1','Hold a slot / 4 seconds'],['SimulateWork2','Hold a slot / 4 seconds'],['SimulateWork3','Hold a slot / 4 seconds']]
 function node(x:number,y:number,w:number,h:number,title:string,detail:string,extra?:string) {
  return <g transform={`translate(${x},${y})`} className={extra}><rect width={w} height={h} rx="3"/><text x={w/2} y={25} textAnchor="middle" className="roads-node-title">{title}</text><text x={w/2} y={47} textAnchor="middle" className="roads-node-detail">{detail}</text></g>
 }
 return <div className="architecture-story roads-architecture">
  <p className="eyebrow">SYSTEM MODEL / {mode==='native'?'NATIVE WORKER ACTIVE · AWS PATH ILLUSTRATED':mode==='lambda'?'SERVERLESS WORKER CONFIGURATION':'CHECKING WORKER CONFIGURATION'}</p>
  <svg className="stage-architecture demo-architecture" viewBox="0 0 900 510" role="img" aria-labelledby={`${id}-roads-title ${id}-roads-desc`}>
   <title id={`${id}-roads-title`}>No Roads: durable task queues, serverless scaling, and four sequential Activities</title>
   <desc id={`${id}-roads-desc`}>The browser calls the Go API to start workflows. Temporal records history and schedules Workflow and Activity Tasks. The Worker Controller invokes Lambda through IAM when queues need capacity. Workers poll queues and report results. Metrics come from Temporal, not CloudWatch. The native local worker replaces Lambda locally. Only the selected workflow Activity is highlighted from recorded history.</desc>
   <defs>
    <marker id={`${id}-roads-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0,0L7,3.5L0,7" fill="var(--brand-highlight)"/></marker>
    <marker id={`${id}-roads-control`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7" fill="#f4b0ed"/></marker>
   </defs>
   <g className="roads-domains"><rect x="245" y="37" width="350" height="348" rx="5"/><rect x="620" y="37" width="265" height="348" rx="5"/></g>
   <g className="roads-domain-label"><text x="15" y="24">BOOTH / GO WEB APP</text><text x="260" y="24">TEMPORAL SERVICE</text><text x="635" y="24">AWS / HOSTED MODEL</text></g>
   <g className="roads-data-path" fill="none" stroke="var(--brand-highlight)" strokeWidth="2" markerEnd={arrow}>
    <path d="M120 118V150"/><path d="M225 184H263"/><path d="M420 118V150"/>
    <path d="M575 188H638" markerStart={arrow}/>
   </g>
   <text x="133" y="138" className="roads-edge-label">tap / burst</text>
   <text x="435" y="138" className="roads-edge-label">schedule tasks</text>
   {node(15,58,210,60,'Booth dashboard','One job or 30–200 jobs')}
   {node(15,153,210,62,'Go submission API','StartWorkflow / Go SDK')}
   {node(265,58,310,60,'Durable Workflow history','Events, results, and replay')}
   <g transform="translate(265,153)"><rect width="310" height="78" rx="3"/><text x="155" y="26" textAnchor="middle" className="roads-node-title">Task Queues</text><text x="155" y="49" textAnchor="middle" className="roads-node-detail">Workflow Tasks + Activity Tasks</text><text x="155" y="68" textAnchor="middle" className="roads-node-detail">Backlog when no slot is available</text></g>
   <text x="605" y="174" textAnchor="middle" className="roads-edge-label">poll /</text><text x="605" y="210" textAnchor="middle" className="roads-edge-label">results</text>
   <g className={mode==='native'?'roads-hosted-inactive':''}>
    <path className="roads-control-path" d="M420 232V280" markerEnd={control}/>
    <text x="432" y="259" className="roads-edge-label">queue pressure</text>
    {node(265,282,310,60,'Worker Controller / WCI','Sync-match failures + backlog')}
    <path className="roads-control-path" d="M575 312H608V244H638" markerEnd={control}/>
    <text x="420" y="369" textAnchor="middle" className="roads-edge-label">InvokeFunction via IAM role</text>
    {node(640,58,225,60,'Worker Deployment','Current / pinned build')}
    <path className="roads-control-path" d="M752 119V153" markerEnd={control}/>
    <rect x="650" y="169" width="225" height="96" rx="3" className="roads-worker-shadow"/>
    <g transform="translate(640,158)"><rect width="225" height="96" rx="3"/><text x="112" y="27" textAnchor="middle" className="roads-node-title">Lambda Workers</text><text x="112" y="51" textAnchor="middle" className="roads-node-detail">Poll → execute → report</text><text x="112" y="75" textAnchor="middle" className="roads-node-detail">5 Activity slots by default</text></g>
    <path className="roads-control-path" d="M752 302V267" markerEnd={control}/>
    {node(640,305,225,60,'Worker authentication','API key / Secrets Manager')}
   </g>
   {node(15,251,210,60,'Dashboard metrics','Counts + queues / 2s cache')}
   <path className="roads-metrics-path" d="M265 91H237V282H227" markerEnd={control}/>
   <path className="roads-metrics-path" d="M40 251V120" markerEnd={control}/>
   {mode==='native' && <>
    {node(15,330,210,55,'Native local worker','Same Workflow + Activities','roads-native-worker')}
    <path className="roads-native-path" d="M225 355H249V215H263" markerEnd={arrow} markerStart={arrow}/>
   </>}
   <text x="15" y="418" className="roads-domain-label">INSIDE ONE WORKFLOW / {cursor?`${cursor.step} · ${cursor.status}${cursor.stale?' · updates interrupted':''}`:'SELECT A WORKFLOW TO FOLLOW ITS ACTIVITIES'}</text>
   {stages.map(([name,detail],index)=><g key={name}>
    {index>0 && <path d={`M${index*220+1} 473h12`} className={cursor?.step===name && cursor.status==='running'?'architecture-links roads-stage-link-active':'roads-stage-link'} markerEnd={arrow}/>}
    {node(15+index*220,440,205,62,name,detail,cursor?.step===name?'execution-node-active':undefined)}
   </g>)}
  </svg>
  <p className="architecture-explanation">{mode==='native'?'Local: one native worker processes real tasks; AWS scaling is illustrated here. ':'Hosted: WCI invokes workers when queues need capacity; each Lambda polls until shutdown near its deadline. '}Each job runs four Activities. Dashboard counts and poller estimates come from Temporal, not CloudWatch.</p>
 </div>
}
