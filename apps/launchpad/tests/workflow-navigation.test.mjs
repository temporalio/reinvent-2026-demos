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
