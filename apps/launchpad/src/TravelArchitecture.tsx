import {travelArchitectureNodes} from './travelArchitecture'
import type {LiveCursor} from './workflowHistory'

/** Logical runtime map verified against the Travel Agent runbook and worker. */
export function TravelArchitecture({cursor,id}:{cursor?:LiveCursor|null;id:string}) {
 const active=travelArchitectureNodes(cursor)
 const nodes=[
  {id:'traveler',x:20,y:38,title:'Traveler',detail:'Chat, trip ideas, option cards'},
  {id:'api',x:350,y:38,title:'Travel web + API',detail:'Messages become Workflow Updates'},
  {id:'temporal',x:680,y:38,title:'Temporal Service',detail:'Durable history + Task Queue'},
  {id:'human',x:20,y:235,title:'Human approvals',detail:'Approve scripts, tools, and choices'},
  {id:'worker',x:350,y:235,title:'Agent Harness worker',detail:'Ziggy conversation Workflow'},
  {id:'gemini',x:680,y:235,title:'Gemini',detail:'Model calls run as Activities'},
  {id:'board',x:20,y:432,title:'Trip board',detail:'Bookings saved in agent state'},
  {id:'sandbox',x:350,y:432,title:'Python sandbox',detail:'Approved code / pydantic-monty'},
  {id:'tools',x:680,y:432,title:'Travel tool Activities',detail:'Search, book, and choose seats'},
 ]
 const arrow=`url(#${id}-travel-arrow)`
 const moving=cursor&&!cursor.stale&&cursor.status==='running'
 return <div className="architecture-story travel-architecture">
  <p className="eyebrow">{cursor?`TRAVEL AGENT / ${cursor.step} / ${cursor.status}${cursor.stale?' / UPDATES INTERRUPTED':''}`:'TRAVEL AGENT / DURABLE CONVERSATION, CODE, AND APPROVALS'}</p>
  <svg className="stage-architecture" viewBox="0 0 980 555" role="img" aria-labelledby={`${id}-travel-title ${id}-travel-description`}>
   <title id={`${id}-travel-title`}>Ziggy Travel Agent architecture</title>
   <desc id={`${id}-travel-description`}>The browser sends messages and approvals through the web API as Workflow Updates. Temporal records history and schedules tasks for the Agent Harness worker. Gemini model calls run as Activities. Approved Python runs in a pydantic-monty sandbox and calls simulated travel services through durable Activities. Trip state and human choices survive worker restarts.</desc>
   <defs><marker id={`${id}-travel-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7" fill="var(--brand-highlight)"/></marker></defs>
   <g className={moving?'architecture-links':''} fill="none" stroke="var(--brand-highlight)" strokeWidth="2" markerEnd={arrow}>
    <path d="M280 84H345"/><path d="M610 84H675"/>
    <path d="M810 130V179H480V230" markerStart={arrow}/>
    <path d="M150 130V230"/>
    <path d="M280 281H345"/>
    <path d="M610 281H675" markerStart={arrow}/>
    <path d="M480 327V427"/>
    <path d="M610 478H675" markerStart={arrow}/>
    <path d="M350 302H315V478H285"/>
   </g>
   <g className="travel-edge-label">
    <text x="315" y="66" textAnchor="middle">HTTPS</text><text x="646" y="66" textAnchor="middle">Updates</text>
    <text x="650" y="167" textAnchor="middle">Worker polls tasks / reports results</text>
    <text x="164" y="183">Tap to approve</text><text x="312" y="260" textAnchor="middle">Updates</text>
    <text x="646" y="260" textAnchor="middle">API</text>
    <text x="495" y="380">Run approved Python</text>
    <text x="646" y="458" textAnchor="middle">Tools</text>
   </g>
   {nodes.map(node=><g key={node.id} transform={`translate(${node.x},${node.y})`} data-travel-node={node.id} className={active.includes(node.id)?'execution-node-active':''} data-status={active.includes(node.id)?cursor?.status:undefined}>
    <rect width="260" height="92" rx="3"/><text x="130" y="35" textAnchor="middle" className="travel-node-title">{node.title}</text><text x="130" y="62" textAnchor="middle" className="travel-node-detail">{node.detail}</text>
   </g>)}
   <text x="810" y="549" textAnchor="middle" className="travel-edge-label">Simulated flights, hotels, and seat maps</text>
  </svg>
  <p className="architecture-explanation">Gemini writes Python; the sandbox can reach only approved travel tools. Temporal records results, approvals, and trip state so a replacement worker resumes the conversation. Highlights follow reported phases; arrows show logical relationships.</p>
 </div>
}
