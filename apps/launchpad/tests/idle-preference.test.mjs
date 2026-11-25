import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readIdlePaused,saveIdlePaused} from '../src/idlePreference.ts'
test('timers default on; a staff pause persists only in that browser',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}
 assert.equal(readIdlePaused(storage),false)
 saveIdlePaused(storage,true);assert.equal(readIdlePaused(storage),true)
 assert.equal(readIdlePaused({getItem:()=>null}),false)
 saveIdlePaused(storage,false);assert.equal(readIdlePaused(storage),false)
})
test('unavailable browser storage leaves timers enabled without throwing',()=>{
 const storage={getItem:()=>{throw Error()},setItem:()=>{throw Error()}}
 assert.equal(readIdlePaused(storage),false);assert.doesNotThrow(()=>saveIdlePaused(storage,true))
})
