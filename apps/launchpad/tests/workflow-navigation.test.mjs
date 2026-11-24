import {test} from 'node:test'
import assert from 'node:assert/strict'
import {workflowTarget} from '../src/workflowNavigation.ts'
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
