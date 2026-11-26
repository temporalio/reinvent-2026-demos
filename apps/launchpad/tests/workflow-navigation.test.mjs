import {test} from 'node:test'
import assert from 'node:assert/strict'
import {workflowTarget} from '../src/workflowNavigation.ts'
import {showInTemporalFrame} from '../src/temporalFrame.ts'
const origin='http://booth.local'
const base='/_temporal/namespaces/default/workflows'
test('workflow list, trailing slash and detail routes are accepted',()=>{
  for(const path of [base,`${base}/`,`${base}/order/run/history`,`${base}?query=Running`])assert.equal(workflowTarget(path,base,origin),`${origin}${path}`)
})
test('near-prefix, unrelated route and external URL cannot replace embedded Temporal',()=>{
  for(const path of [`${base}-other`, '/banking/', 'https://other.test'+base])assert.equal(workflowTarget(path,base,origin),null)
})

test('photo strip workflow and run links stay under the configured Temporal proxy',()=>{
  const host='https://reinvent-booth.tmprl-demo.cloud'
  const ui='/_temporal/primary/namespaces/fieldkit-reinvent-2026.a2dd6/workflows'
  const workflow=`${ui}/holodeck-laptop-photobooth-a0b69032bf`
  assert.equal(workflowTarget(workflow,ui,host),host+workflow)
  assert.equal(workflowTarget(`${workflow}/exact-run/timeline`,ui,host),`${host}${workflow}/exact-run/timeline`)
  assert.equal(workflowTarget(workflow.replace('/primary/','/other/'),ui,host),null)
})

test('explicit workflow selections reset nested scroll even for the current route',()=>{
 const outer={scrollTop:240},wrapper={scrollTop:300},content={scrollTop:510},timeline={scrollTop:65}
 let clicks=0,removed=0
 const doc={readyState:'complete',location:{href:'http://booth.local/workflow/run'},scrollingElement:outer,querySelectorAll:selector=>selector==='*'?[wrapper,content,timeline]:[content,timeline],body:{append:()=>{}},createElement:()=>({click(){clicks++},remove(){removed++}})}
 const frame={contentDocument:doc,contentWindow:{requestAnimationFrame:callback=>callback()}}
 showInTemporalFrame(frame,doc.location.href)
 assert.deepEqual([outer.scrollTop,wrapper.scrollTop,content.scrollTop,timeline.scrollTop],[240,300,510,65])
 showInTemporalFrame(frame,doc.location.href,{resetScroll:true})
 assert.deepEqual([outer.scrollTop,wrapper.scrollTop,content.scrollTop,timeline.scrollTop],[0,0,0,0])
 assert.equal(clicks,2);assert.equal(removed,2)
})
