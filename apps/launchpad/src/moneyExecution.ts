export type MoneyExecution={transferId:string|null;scenario:string;step:string|null;status:string|null;attempt:number;finalStatus:string|null;streamState:'idle'|'live'|'stale'}
const steps=['validate','withdraw','approval_wait','deposit','undo_withdraw','send_notification_success','send_notification_failure']
const scenarios=['happy_path','advanced_visibility','human_in_the_loop','api_downtime','bug_in_workflow','invalid_account']
export const moneyStepLabels:Record<string,string>={validate:'Validate transfer',withdraw:'Withdraw funds',approval_wait:'Wait for approval',deposit:'Deposit funds',undo_withdraw:'Reverse withdrawal',send_notification_success:'Notify success',send_notification_failure:'Notify failure'}

/** Progress must come from the owned demo frame, not another tab or iframe. */
export function readMoneyExecution(event:Pick<MessageEvent,'origin'|'source'|'data'>,origin:string,owner:MessageEventSource|null):MoneyExecution|null {
 const d=event.data
 if(!owner || event.source!==owner || event.origin!==origin || d?.type!=='booth:money-execution')return null
 if(!(d.transferId===null || (typeof d.transferId==='string' && d.transferId.length>0 && d.transferId.length<200)) || !scenarios.includes(d.scenario))return null
 if(!(d.step===null || steps.includes(d.step)) || !(d.status===null || ['pending','running','completed','failed','retrying'].includes(d.status)))return null
 if(!Number.isInteger(d.attempt) || d.attempt<0 || !(d.finalStatus===null || ['completed','reversed','failed'].includes(d.finalStatus)) || !['idle','live','stale'].includes(d.streamState))return null
 return {transferId:d.transferId,scenario:d.scenario,step:d.step,status:d.status,attempt:d.attempt,finalStatus:d.finalStatus,streamState:d.streamState}
}
export function moneyLineStatus(run:MoneyExecution|null|undefined):string|undefined {
 if(!run?.transferId || !run.step)return undefined
 return run.step==='approval_wait' && run.status==='running'?'waiting':run.status || undefined
}

/** Highlight the await and its Activity/condition; events are not a CPU trace. */
export function activeCodeLines(code:string,step:string|null|undefined):number[] {
 if(!step)return []
 const calls:Record<string,string>={validate:'AccountTransferActivities.validate',withdraw:'AccountTransferActivities.withdraw',approval_wait:'workflow.wait_condition',deposit:'AccountTransferActivities.deposit',undo_withdraw:'AccountTransferActivities.undoWithdraw',send_notification_success:'AccountTransferActivities.sendNotification',send_notification_failure:'AccountTransferActivities.sendNotification',validate_order:'validate_order_activity',validate_store:'validate_store_activity',authorize_payment:'authorize_payment_activity',clear_cart:'clear_cart_activity',submit_to_store:'submit_to_store_activity',order_ready:'workflow.wait_condition',capture_payment:'capture_payment_activity',release_payment_hold:'release_payment_hold_activity',notify_customer_success:'notify_customer_activity',notify_customer_failure:'notify_customer_activity'}
 const marker=calls[step];if(!marker)return []
 const lines=code.split('\n'),index=lines.findIndex(line=>line.includes(marker))
 if(index<0)return []
 if(marker==='workflow.wait_condition')return [index,Math.min(index+1,lines.length-1)]
 return index>0 && lines[index-1].includes('execute_activity')?[index-1,index]:[index]
}
