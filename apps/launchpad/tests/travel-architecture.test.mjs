import {test} from 'node:test'
import assert from 'node:assert/strict'
import {travelArchitectureNodes} from '../src/travelArchitecture.ts'
test('model, human, and tool phases highlight distinct runtime components',()=>{
 const c=step=>({step,status:'running'})
 assert.deepEqual(travelArchitectureNodes(),[])
 assert.deepEqual(travelArchitectureNodes(c('gemini_interactions_create_streamed')),['worker','gemini'])
 assert.deepEqual(travelArchitectureNodes(c('approval')),['human','temporal'])
 assert.deepEqual(travelArchitectureNodes(c('book_hotel')),['worker','sandbox','tools'])
 assert.deepEqual(travelArchitectureNodes(c('run_travel_code')),['worker','sandbox'])
 assert.deepEqual(travelArchitectureNodes(c('unknown')),[])
 assert.deepEqual(travelArchitectureNodes({...c('book_hotel'),terminal:true}),['temporal','board'])
})
