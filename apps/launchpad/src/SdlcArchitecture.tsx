import type {LiveCursor} from './workflowHistory'

function activeParts(cursor?:LiveCursor|null):string[] {
 if(!cursor)return []
 const step=cursor.step.toLowerCase()
 if(cursor.terminal)return ['history','environments']
 if(step.startsWith('gate:')||/approv|release_decision|wait_for_people/.test(step))return ['approvals','pipeline']
 if(/plan|coder|review|agent/.test(step))return ['pipeline','agents']
 if(/model|openai|anthropic|gemini/.test(step))return ['agents','models']
 if(/test|check|git|commit|tool/.test(step))return ['agents','tools']
 if(/deploy|stag|prod/.test(step))return ['environments','pipeline']
 return []
}

/** Runtime and control flows verified against the SDLC README and webhook runbook. */
export function SdlcArchitecture({cursor,id}:{cursor?:LiveCursor|null;id:string}) {
 const active=activeParts(cursor)
 const nodes=[
  {id:'console',x:20,y:40,title:'Booth console',detail:'Scenarios, controls, live progress'},
  {id:'api',x:350,y:40,title:'FastAPI + webhook router',detail:'Verify signature and permissions'},
  {id:'history',x:680,y:40,title:'Temporal Service',detail:'History, Task Queues, Signals'},
  {id:'github',x:20,y:240,title:'GitHub sandbox repository',detail:'Issues, PRs, comments, check runs'},
  {id:'slots',x:350,y:240,title:'Session Slot Workflows',detail:'Lease a queue, workers, and label'},
  {id:'pipeline',x:680,y:240,title:'Pipeline Workflows',detail:'Dependency / PR / issue-to-release'},
  {id:'redis',x:20,y:440,title:'Redis event stream',detail:'Agent events relayed through API'},
  {id:'agents',x:350,y:440,title:'Agent Child Workflows',detail:'Planner, parallel coders, reviewers'},
  {id:'models',x:680,y:440,title:'Configured model providers',detail:'OpenAI / Anthropic / Gemini'},
  {id:'approvals',x:20,y:640,title:'GitHub Actions approvals',detail:'Plan, merge, production gates'},
  {id:'tools',x:350,y:640,title:'Git and test tools',detail:'Edit branches, run tests, post PRs'},
  {id:'environments',x:680,y:640,title:'Staging + production views',detail:'Web serves selected GitHub commits'},
 ]
 const arrow=`url(#${id}-sdlc-arrow)`
 const moving=cursor&&!cursor.stale&&cursor.status==='running'
 return <div className="architecture-story sdlc-architecture">
  <p className="eyebrow">{cursor?`AGENTIC SDLC / ${cursor.step} / ${cursor.status}${cursor.stale?' / UPDATES INTERRUPTED':''}`:'AGENTIC SDLC / WEBHOOKS, DURABLE AGENTS, AND RELEASE GATES'}</p>
  <svg className="stage-architecture" viewBox="0 0 1020 760" role="img" aria-labelledby={`${id}-sdlc-title ${id}-sdlc-description`}>
   <title id={`${id}-sdlc-title`}>Agentic SDLC architecture and communication flows</title>
   <desc id={`${id}-sdlc-description`}>GitHub webhooks are verified and route starts or Signals to Temporal Workflows. Session Slot Workflows assign separate queues and labels. Version-pinned pipeline workers start planner, coder, and reviewer Child Workflows. Agents call configured models and Git/test tools, publishing live events through Redis and FastAPI to the console. GitHub Actions environment approvals return through workflow_run webhooks. The web server serves staging and production commits.</desc>
   <defs><marker id={`${id}-sdlc-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7" fill="var(--brand-highlight)"/></marker></defs>
   <g className={moving?'architecture-links':''} fill="none" stroke="var(--brand-highlight)" strokeWidth="2" markerEnd={arrow}>
    <path d="M280 85H345"/><path d="M610 85H675"/>
    <path d="M280 285H310V105H345"/>
    <path d="M480 130V235" markerStart={arrow}/>
    <path d="M810 130V235" markerStart={arrow}/>
    <path d="M680 285H645V400H480V435"/>
    <path d="M350 485H285"/><path d="M610 485H675" markerStart={arrow}/>
    <path d="M150 440V380H325V150H390V135"/>
    <path d="M480 530V635"/>
    <path d="M940 285H1000V600H150V635"/>
    <path d="M20 685H5V285H15"/>
    <path d="M940 310H978V685H945"/>
   </g>
   <g className="sdlc-edge-label">
    <text x="315" y="66" textAnchor="middle">HTTPS</text><text x="645" y="62" textAnchor="middle"><tspan x="645">Start</tspan><tspan x="645" dy="13">Signal</tspan></text>
    <text x="24" y="220">Signed webhooks</text>
    <text x="493" y="185">Claim / renew</text><text x="823" y="185">Poll / results</text>
    <text x="480" y="386" textAnchor="middle">Start Child Workflows</text>
    <text x="316" y="466" textAnchor="middle">Events</text><text x="645" y="466" textAnchor="middle">LLM API</text>
    <text x="180" y="366">SSE via API</text><text x="495" y="585">Tool calls</text>
    <text x="810" y="587" textAnchor="middle">Dispatch release.yml</text>
    <text x="20" y="748">workflow_run webhook → release_decision Signal</text>
   </g>
   {nodes.map(node=><g key={node.id} transform={`translate(${node.x},${node.y})`} data-sdlc-node={node.id} className={active.includes(node.id)?'execution-node-active':''}>
    <rect width="260" height="90" rx="3"/><text x="130" y="34" textAnchor="middle" className="sdlc-node-title">{node.title}</text><text x="130" y="61" textAnchor="middle" className="sdlc-node-detail">{node.detail}</text>
   </g>)}
  </svg>
  <p className="architecture-explanation">Runs and child agents stay pinned to their worker version. Comments and deployment approvals resume durable waits; Redis carries live events without polling Workflow Queries. GitHub mutations and model calls are real. Arrows show logical flows; highlights use recorded steps.</p>
 </div>
}
