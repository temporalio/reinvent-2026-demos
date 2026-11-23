import { tacoPhases, tacoPhase, tacoProgressText, type TacoExecution, type TacoPhase } from './tacoExecution'

export function ExecutionProgress({run,phase,following,onSelect,onFollow}:{run:TacoExecution|null;phase:TacoPhase;following:boolean;onSelect:(phase:TacoPhase)=>void;onFollow:()=>void}) {
  const live=tacoPhase(run)
  return <div className="execution-progress">
    <div className="execution-progress-controls"><div role="group" aria-label="Order phases">{tacoPhases.map(item=><button key={item.id} aria-pressed={phase===item.id} onClick={()=>onSelect(item.id)}>{item.label}{run?.orderId && live===item.id && <span aria-label="Current phase"> ●</span>}</button>)}</div><button aria-pressed={following} onClick={onFollow}>Follow live</button></div>
    <p role="status">{!following?'Exploring a phase · ':''}{tacoProgressText(run)}{run?.mode==='traditional'?' Direct calls; no Temporal Workflow.':''}</p>
  </div>
}
