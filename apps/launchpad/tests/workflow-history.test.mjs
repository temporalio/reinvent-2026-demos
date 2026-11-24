import {test} from 'node:test'
import assert from 'node:assert/strict'
import {historyCursor,workflowApi} from '../src/workflowHistory.ts'
import {liveExcerpt,readDemoExecution} from '../src/demoExecution.ts'
const event=(id,key,attributes)=>({eventId:String(id),[key]:attributes})
const scheduled=(id,name)=>event(id,'activityTaskScheduledEventAttributes',{activityType:{name}})
const complete=(id,scheduledId)=>event(id,'activityTaskCompletedEventAttributes',{scheduledEventId:String(scheduledId)})
test('history API is pinned to the exact namespace and run on this origin',()=>{
 assert.equal(workflowApi('/_temporal/primary/namespaces/booth/workflows/job-1/run-2/timeline','https://booth.example'),'/_temporal/primary/api/v1/namespaces/booth/workflows/job-1/history?execution.runId=run-2&maximumPageSize=1000')
 assert.equal(workflowApi('https://elsewhere.example/_temporal/primary/namespaces/booth/workflows/job-1/run-2','https://booth.example'),null)
 assert.equal(workflowApi('/_temporal/primary/namespaces/booth/workflows','https://booth.example'),null)
})
test('pending Activities advance from recorded completion, not an animation timer',()=>{
 const events=[event(1,'workflowExecutionStartedEventAttributes',{workflowType:{name:'DataPipelineWorkflowHappyPath'}}),scheduled(2,'extract'),complete(3,2),scheduled(4,'transform')]
 assert.deepEqual(historyCursor(events,'run'),{runId:'run',step:'transform',status:'running',terminal:false,variant:'happy'})
 const cursor=historyCursor([...events,complete(5,4),event(6,'workflowExecutionCompletedEventAttributes',{})],'run')
 assert.equal(cursor.status,'completed');assert.equal(cursor.terminal,true)
 assert.equal(liveExcerpt('data-pipeline',cursor).label,'Transform')
})
test('children, code bugs and human timers report their recorded states',()=>{
 assert.equal(historyCursor([event(1,'startChildWorkflowExecutionInitiatedEventAttributes',{workflowType:{name:'FraudIdentityAgent'}})],'run').step,'FraudIdentityAgent')
 assert.equal(historyCursor([event(1,'workflowTaskFailedEventAttributes',{})],'run').status,'retrying')
 assert.equal(historyCursor([event(1,'timerStartedEventAttributes',{})],'run').status,'waiting')
 const failed=historyCursor([scheduled(1,'validate'),event(2,'workflowExecutionFailedEventAttributes',{})],'run')
 assert.equal(failed.status,'failed');assert.equal(failed.terminal,true)
})
test('app-reported human steps require the owned iframe and an existing source excerpt',()=>{
 const owner={},origin='https://booth.example',data={type:'booth:demo-execution',demoId:'data-pipeline',runId:'run',step:'signal',status:'waiting',variant:'scenario',stale:false},ev={data,source:owner,origin}
 assert.equal(readDemoExecution(ev,origin,owner,'data-pipeline').step,'signal')
 assert.equal(readDemoExecution({...ev,source:{}},origin,owner,'data-pipeline'),null)
 assert.equal(readDemoExecution({...ev,origin:'https://other.example'},origin,owner,'data-pipeline'),null)
 assert.equal(readDemoExecution({...ev,data:{...data,step:'imaginary'}},origin,owner,'data-pipeline'),null)
 for(const [demoId,step,variant] of [['no-roads','SimulateWork2','default'],['loan','approval','default'],['agent-harness','approval','default'],['agentic-sdlc','gate:plan','issue']])assert.ok(liveExcerpt(demoId,{runId:'run',step,status:'waiting',variant}))
})
