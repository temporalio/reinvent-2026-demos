import {test} from 'node:test'
import assert from 'node:assert/strict'
import {demoWorkflowList,demoWorkflowQueries} from '../src/demoWorkflowList.ts'
test('each demo receives its own filter, leaving exact executions untouched',()=>{
 const base='https://booth.example/_temporal/primary/namespaces/default/workflows'
 assert.equal(Object.keys(demoWorkflowQueries).length,10)
 for(const demo of Object.keys(demoWorkflowQueries)){
  const url=new URL(demoWorkflowList(base,demo,'https://booth.example'))
  assert.equal(url.searchParams.get('query'),demoWorkflowQueries[demo])
  assert.equal(demoWorkflowList(url.href,demo,'https://booth.example'),url.href)
  assert.equal(demoWorkflowList(base+'/job-1/run-2/timeline',demo,'https://booth.example'),base+'/job-1/run-2/timeline')
 }
})
test('existing attendee filters compose with the demo scope without duplication',()=>{
 const base='https://booth.example/_temporal/primary/namespaces/default/workflows?query='+encodeURIComponent('ExecutionStatus="Running"')
 const first=demoWorkflowList(base,'data-pipeline','https://booth.example')
 assert.equal(new URL(first).searchParams.get('query'),'('+demoWorkflowQueries['data-pipeline']+') AND (ExecutionStatus="Running")')
 assert.equal(demoWorkflowList(first,'data-pipeline','https://booth.example'),first)
 assert.equal(demoWorkflowList('https://elsewhere.example/workflows','data-pipeline','https://booth.example'),'https://elsewhere.example/workflows')
})
