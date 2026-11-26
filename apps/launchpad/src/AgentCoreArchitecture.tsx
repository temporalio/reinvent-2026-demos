import type {LiveCursor} from './workflowHistory'

/** AgentCore supplies compute; Temporal owns the wait and replayable execution state. */
export function AgentCoreArchitecture({cursor,id}:{cursor?:LiveCursor|null;id:string}) {
 const step=cursor?.step||''
 const active=step==='approval'||step==='timer'?['history','wait']:['resolved','closed'].includes(step)?['history']:['remediating','closing'].includes(step)?['invoke','worker','agent','tools']:step==='diagnosing'?['worker','agent','tools']:[]
 const nodes=[
  {id:'captain',x:20,y:40,title:'Captain / booth screen',detail:'Choose an alarm; approve repair'},
  {id:'api',x:350,y:40,title:'Go incident API',detail:'Start Workflow / decide Signal'},
  {id:'history',x:680,y:40,title:'Temporal Cloud',detail:'History + Task Queue + memo'},
  {id:'reads',x:20,y:240,title:'Read-only progress view',detail:'Describe, memo, Event History'},
  {id:'invoke',x:350,y:240,title:'On-demand invocation',detail:'Queued work with no poller'},
  {id:'worker',x:680,y:240,title:'AgentCore worker session',detail:'Poll tasks, report results, drain'},
  {id:'wait',x:20,y:440,title:'Durable approval wait',detail:'Up to 24 hours; no worker needed'},
  {id:'agent',x:350,y:440,title:'Strands + TemporalAgent',detail:'Model and tool calls = Activities'},
  {id:'tools',x:680,y:440,title:'Bedrock + ship tools',detail:'Telemetry, logs, simulated repair'},
 ]
 const arrow=`url(#${id}-agentcore-arrow)`
 return <div className="architecture-story agentcore-architecture">
  <p className="eyebrow">{cursor?`AGENTCORE / ${step} / ${cursor.status}${cursor.stale?' / UPDATES INTERRUPTED':''}`:'AGENTCORE / COMPUTE CAN STOP; THE WORKFLOW REMEMBERS'}</p>
  <svg className="stage-architecture" viewBox="0 0 980 560" role="img" aria-labelledby={`${id}-agentcore-title ${id}-agentcore-description`}>
   <title id={`${id}-agentcore-title`}>On-demand agent execution with Temporal and AgentCore</title>
   <desc id={`${id}-agentcore-description`}>The Go API starts an incident Workflow and records approval as a decide Signal. Temporal invokes AgentCore when work is queued with no worker. The worker runs a Strands agent through TemporalAgent, recording model and simulated tool calls as Activities. An interrupt waits for approval with no compute. A new invocation replays results and resumes. Progress uses Describe and history, never a Query. This is the hosted design; local mode uses an invoker and scripted model.</desc>
   <defs><marker id={`${id}-agentcore-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7" fill="var(--brand-highlight)"/></marker></defs>
   <g fill="none" stroke="var(--brand-highlight)" strokeWidth="2" markerEnd={arrow}>
    <path d="M280 85H345"/><path d="M610 85H675"/>
    <path d="M150 130V235"/>
    <path d="M280 285H310V160H730V135"/>
    <path d="M810 130V185H480V235"/>
    <path d="M610 285H675"/>
    <path d="M900 240V145H900V135" markerStart={arrow}/>
    <path d="M680 300H645V400H480V435"/>
    <path d="M610 485H675" markerStart={arrow}/>
    <path d="M350 485H285"/>
   </g>
   <g className="agentcore-edge-label">
    <text x="315" y="66" textAnchor="middle">HTTPS</text><text x="645" y="62" textAnchor="middle"><tspan x="645">Start</tspan><tspan x="645" dy="13">Signal</tspan></text>
    <text x="164" y="205">Poll API</text><text x="495" y="151">Reads need no running worker</text>
    <text x="480" y="216" textAnchor="middle">Invoke runtime</text><text x="645" y="267" textAnchor="middle">Start</text>
    <text x="902" y="213" textAnchor="end">Tasks / results</text><text x="480" y="386" textAnchor="middle">Execute / replay</text>
    <text x="315" y="467" textAnchor="middle">Interrupt</text><text x="645" y="467" textAnchor="middle">Calls</text>
    <text x="20" y="551">Approval is recorded first. A replacement worker reuses completed results and resumes the repair.</text>
   </g>
   {nodes.map(node=><g key={node.id} transform={`translate(${node.x},${node.y})`} data-agentcore-node={node.id} className={active.includes(node.id)?'execution-node-active':''}>
    <rect width="260" height="90" rx="3"/><text x="130" y="34" textAnchor="middle" className="agentcore-node-title">{node.title}</text><text x="130" y="61" textAnchor="middle" className="agentcore-node-detail">{node.detail}</text>
   </g>)}
  </svg>
  <p className="architecture-explanation">Hosted design: a worker session drains when idle; the next Signal can start a new one. Local mode uses a local invoker and scripted model. The repair tool is simulated in both modes. Arrows show logical flows; highlights follow recorded incident phases.</p>
 </div>
}
