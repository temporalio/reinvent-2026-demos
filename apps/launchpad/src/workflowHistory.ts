export type HistoryEvent={eventId?:string;[key:string]:unknown}
export type LiveCursor={step:string;status:string;variant?:string;stale?:boolean;runId:string;terminal?:boolean}
/** Only exact runs underneath the configured same-origin UI may be queried. */
export function workflowApi(url:string,origin:string):string|null {
 try{
  const u=new URL(url,origin)
  const m=u.pathname.match(/^(\/_temporal\/[^/]+)\/namespaces\/([^/]+)\/workflows\/([^/]+)\/([^/]+)(?:\/|$)/)
  if(u.origin!==origin||!m)return null
  return `${m[1]}/api/v1/namespaces/${m[2]}/workflows/${m[3]}/history?execution.runId=${m[4]}&maximumPageSize=1000`
 }catch{return null}
}
/** Decode only event metadata; attendee inputs and Activity results are never read. */
export function historyCursor(events:HistoryEvent[],runId:string):LiveCursor|null {
 const scheduled=new Map<string,string>(),children=new Map<string,string>()
 let last:LiveCursor|null=null,type=''
 for(const event of events){
  const e=event as Record<string,any>
  if(e.workflowExecutionStartedEventAttributes)type=e.workflowExecutionStartedEventAttributes.workflowType?.name||''
  const a=e.activityTaskScheduledEventAttributes
  if(a){scheduled.set(String(e.eventId),a.activityType.name);last={runId,step:a.activityType.name,status:'running'}}
  const child=e.startChildWorkflowExecutionInitiatedEventAttributes
  if(child){children.set(String(e.eventId),child.workflowType.name);last={runId,step:child.workflowType.name,status:'running'}}
  for(const [key,status] of [['activityTaskCompletedEventAttributes','completed'],['activityTaskFailedEventAttributes','failed'],['activityTaskTimedOutEventAttributes','retrying']] as const){
   if(e[key]){const id=String(e[key].scheduledEventId),step=scheduled.get(id);if(step)last={runId,step,status};scheduled.delete(id)}
  }
  const done=e.childWorkflowExecutionCompletedEventAttributes
  if(done)children.delete(String(done.initiatedEventId))
  if(e.workflowTaskFailedEventAttributes)last={runId,step:'bug',status:'retrying'}
  if(e.timerStartedEventAttributes && !scheduled.size && !children.size)last={runId,step:'timer',status:'waiting'}
  if(e.workflowExecutionCompletedEventAttributes)last={runId,step:last?.step||'complete',status:'completed'}
  if(e.workflowExecutionFailedEventAttributes || e.workflowExecutionTimedOutEventAttributes || e.workflowExecutionTerminatedEventAttributes || e.workflowExecutionCanceledEventAttributes)last={runId,step:last?.step||'complete',status:'failed'}
 }
 if(!last)return null
 last.terminal=events.some(e=>['workflowExecutionCompletedEventAttributes','workflowExecutionFailedEventAttributes','workflowExecutionTimedOutEventAttributes','workflowExecutionTerminatedEventAttributes','workflowExecutionCanceledEventAttributes'].some(key=>e[key]))
 const active=[...scheduled.values()].at(-1)||[...children.values()].at(-1)
 if(active && !last.terminal)last={runId,step:active,status:'running',terminal:false}
 if(type.startsWith('DataPipeline'))last.variant=type==='DataPipelineWorkflowHappyPath'?'happy':'scenario'
 return last
}
