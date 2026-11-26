import {test} from 'node:test'
import assert from 'node:assert/strict'
import {poll} from '../src/shared/polling.ts'
const turn=()=>new Promise(resolve=>setTimeout(resolve,0))
test('leaving a screen aborts its request and rejects a late render',async()=>{
 let resolve,signal,renders=0,calls=0
 const stop=poll(s=>{calls++;signal=s;return new Promise(r=>resolve=r)},()=>{renders++},1)
 stop();assert.equal(signal.aborted,true)
 resolve('old visitor');await turn();await turn()
 assert.equal(renders,0);assert.equal(calls,1)
})
test('slow requests never overlap and a completed result stops polling',async()=>{
 let resolve,calls=0,renders=0
 const stop=poll(()=>{calls++;return new Promise(r=>resolve=r)},()=>{renders++;return true},1)
 await turn();await turn();assert.equal(calls,1)
 resolve('done');await turn();await turn()
 assert.equal(calls,1);assert.equal(renders,1);stop()
})
