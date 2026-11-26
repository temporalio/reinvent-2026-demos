import snippets from './executionExcerpts.json' with {type:'json'}
import type {LiveCursor} from './workflowHistory.ts'
export type LiveExcerpt={path:string;startLine:number;endLine:number;code:string;focus:number[];label:string}
export const executionExcerpts=snippets as Record<string,Record<string,Record<string,LiveExcerpt>>>
export function liveExcerpt(demoId:string,cursor:LiveCursor|null|undefined):LiveExcerpt|undefined {
 if(!cursor)return undefined
 const variants=executionExcerpts[demoId]
 return variants?.[cursor.variant||'default']?.[cursor.step]
}
export function readDemoExecution(event:Pick<MessageEvent,'origin'|'source'|'data'>,origin:string,owner:MessageEventSource|null,demoId:string):LiveCursor|null {
 const d=event.data
 if(!owner||event.source!==owner||event.origin!==origin||d?.type!=='booth:demo-execution'||d.demoId!==demoId)return null
 if(typeof d.runId!=='string'||!d.runId||d.runId.length>250||typeof d.step!=='string'||!['running','waiting','completed','failed','retrying','pending'].includes(d.status)||typeof d.stale!=='boolean')return null
 const cursor={runId:d.runId,step:d.step,status:d.status,variant:d.variant,stale:d.stale}
 return liveExcerpt(demoId,cursor)?cursor:null
}
