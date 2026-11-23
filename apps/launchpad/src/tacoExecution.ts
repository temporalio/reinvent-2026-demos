export type TacoPhase = 'order'|'kitchen'|'ready'|'finish'|'recovery'
export type TacoExecution = {
  orderId:string|null; mode:'temporal'|'traditional'; language:string;
  step:string|null; status:string|null; attempt:number; finalStatus:string|null; interrupted:boolean;
}
export const tacoPhases:{id:TacoPhase;label:string}[] = [
  {id:'order',label:'Order'}, {id:'kitchen',label:'Kitchen delivery'},
  {id:'ready',label:'Ready signal'}, {id:'finish',label:'Finish'}, {id:'recovery',label:'Recovery'},
]
const statuses=['pending','running','completed','failed','retrying']
const steps=['validate_order','validate_store','authorize_payment','clear_cart','submit_to_store','order_ready','capture_payment','release_payment_hold','notify_customer_success','notify_customer_failure']
/** Only the owning, same-origin demo frame can report execution progress. */
export function readTacoExecution(event:Pick<MessageEvent,'origin'|'source'|'data'>,origin:string,owner:MessageEventSource|null):TacoExecution|null {
  const d=event.data
  if(!owner || event.source!==owner || event.origin!==origin || d?.type!=='booth:tacos-execution')return null
  if(!(d.orderId===null || (typeof d.orderId==='string' && d.orderId.length>0 && d.orderId.length<200)) || !['temporal','traditional'].includes(d.mode) || typeof d.language!=='string' || d.language.length>32)return null
  if(!(d.step===null || steps.includes(d.step)) || !(d.status===null || statuses.includes(d.status)) || !Number.isInteger(d.attempt) || d.attempt<0 || !(d.finalStatus===null || ['completed','failed','refunded','cancelled','canceled','terminated','timed_out'].includes(d.finalStatus)) || typeof d.interrupted!=='boolean')return null
  return {orderId:d.orderId,mode:d.mode,language:d.language,step:d.step,status:d.status,attempt:d.attempt,finalStatus:d.finalStatus,interrupted:d.interrupted}
}
export function tacoPhase(run:TacoExecution|null):TacoPhase {
  if(!run?.orderId)return 'order'
  if(run.finalStatus==='completed')return 'finish'
  if(run.finalStatus || ['release_payment_hold','notify_customer_failure'].includes(run.step || ''))return 'recovery'
  if(['order_ready','capture_payment','notify_customer_success'].includes(run.step || ''))return 'finish'
  if(run.step==='submit_to_store')return run.status==='completed'?'ready':'kitchen'
  return 'order'
}
export type PhaseSelection={orderId:string|null;phase:TacoPhase}|null
export function displayedTacoPhase(run:TacoExecution|null,selection:PhaseSelection):TacoPhase {
  return run && selection?.orderId===run.orderId?selection.phase:tacoPhase(run)
}
export function tacoProgressText(run:TacoExecution|null):string {
  if(!run?.orderId)return 'Place an order to follow its progress.'
  if(run.interrupted)return 'Live updates interrupted. Last reported step shown.'
  if(run.finalStatus)return `Order ${run.finalStatus}.`
  if(tacoPhase(run)==='ready')return 'Kitchen accepted the order. Waiting for the ready Signal.'
  if(run.status==='retrying' || run.status==='failed')return `${run.step?.replaceAll('_',' ')} · ${run.status} · attempt ${run.attempt}`
  return run.step?`${run.step.replaceAll('_',' ')} · ${run.status}`:'Starting order…'
}
