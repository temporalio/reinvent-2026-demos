import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tacoPhase,displayedTacoPhase,readTacoExecution,tacoProgressText} from '../src/tacoExecution.ts'
const run={orderId:'first',mode:'temporal',language:'python',step:'submit_to_store',status:'retrying',attempt:2,finalStatus:null,interrupted:false}
test('retries stay on delivery; accepted delivery waits for the human Signal',()=>{
  assert.equal(tacoPhase(run),'kitchen')
  assert.equal(tacoPhase({...run,status:'completed'}),'ready')
  assert.equal(tacoPhase({...run,step:'order_ready',status:'completed'}),'finish')
  assert.equal(tacoPhase({...run,step:'capture_payment',status:'running'}),'finish')
  assert.equal(tacoPhase({...run,finalStatus:'completed'}),'finish')
  assert.match(tacoProgressText(run),/attempt 2/)
  assert.match(tacoProgressText({...run,status:'completed'}),/Waiting for the ready Signal/)
})
test('failure and compensation show recovery, not a successful completion',()=>{
  assert.equal(tacoPhase({...run,step:'release_payment_hold'}),'recovery')
  assert.equal(tacoPhase({...run,finalStatus:'refunded'}),'recovery')
  assert.equal(tacoPhase({...run,finalStatus:'failed'}),'recovery')
  assert.match(tacoProgressText({...run,interrupted:true}),/interrupted/)
})
test('manual exploration follows the selected phase until reset or a new order',()=>{
  const selection={orderId:'first',phase:'order'}
  assert.equal(displayedTacoPhase(run,selection),'order')
  assert.equal(displayedTacoPhase(run,null),'kitchen')
  assert.equal(displayedTacoPhase({...run,orderId:null,step:null},selection),'order')
  assert.equal(displayedTacoPhase({...run,orderId:'second',step:null},selection),'order')
  assert.equal(displayedTacoPhase({...run,orderId:'second'},selection),'kitchen')
})
test('messages require the owned iframe, origin, and a valid event shape',()=>{
  const owner={},origin='https://booth.example'
  const event={source:owner,origin,data:{type:'booth:tacos-execution',...run}}
  assert.deepEqual(readTacoExecution(event,origin,owner),run)
  assert.equal(readTacoExecution({...event,source:{}},origin,owner),null)
  assert.equal(readTacoExecution({...event,origin:'https://elsewhere.example'},origin,owner),null)
  assert.equal(readTacoExecution(event,origin,null),null)
  assert.equal(readTacoExecution({...event,data:{...event.data,step:'unknown'}},origin,owner),null)
  assert.equal(readTacoExecution({...event,data:{...event.data,attempt:-1}},origin,owner),null)
  assert.equal(readTacoExecution({...event,data:{...event.data,finalStatus:'refunded'}},origin,owner)?.finalStatus,'refunded')
})
