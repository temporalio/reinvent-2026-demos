import {test} from 'node:test'
import assert from 'node:assert/strict'
import {launchRestriction} from '../src/stationPolicy.ts'
const demo={id:'tacos',tentative:false}
const online={demo_enabled:{},network_mode:'online'}
test('saved enablement cannot bypass a missing local process',()=>{
  assert.equal(launchRestriction(demo,{mode:'local',availableDemos:[]},{...online,demo_enabled:{tacos:true}},true),'Not running on this station')
})
test('offline policy cannot make a hosted process local',()=>{
  assert.equal(launchRestriction(demo,{mode:'hosted'},{...online,network_mode:'offline'},true),'Offline mode requires the local demo runner')
})
test('offline mode allows tested local adapters and blocks model-dependent previews',()=>{
  const settings={...online,network_mode:'offline'}
  assert.equal(launchRestriction(demo,{mode:'local'},settings,true),null)
  assert.equal(launchRestriction({id:'loan',tentative:false},{mode:'local'},settings,true),'Internet required')
})
test('unloaded settings and explicit disablement gate new launches',()=>{
  assert.equal(launchRestriction(demo,{mode:'local'},online,false),'Loading station settings…')
  assert.equal(launchRestriction(demo,{mode:'local'},{...online,demo_enabled:{tacos:false}},true),'Disabled for this station')
})
test('packaged video is available locally without a worker but obeys station disablement',()=>{
 const video={id:'agentcore-video',tentative:false,kind:'video'}
 assert.equal(launchRestriction(video,{mode:'local',availableDemos:[]},{...online,network_mode:'offline'},true),null)
 assert.equal(launchRestriction(video,{mode:'hosted'},online,true),null)
 assert.equal(launchRestriction(video,{mode:'local'},{...online,demo_enabled:{'agentcore-video':false}},true),'Disabled for this station')
})
test('enabling a future demo cannot bypass its missing integration',()=>{
 assert.equal(launchRestriction({id:'agentcore-research',tentative:false,kind:'coming-soon'},{mode:'hosted'},{...online,demo_enabled:{'agentcore-research':true}},true),'Coming soon — demo integration pending')
})

test('on-call launches hosted and needs the local adapter locally',()=>{
 const demo={id:'agentcore-research',tentative:false,kind:'agentcore'}
 const settings={demo_enabled:{},network_mode:'online'}
 assert.equal(launchRestriction(demo,{mode:'hosted'},settings,true),null)
 assert.equal(launchRestriction(demo,{mode:'local',availableDemos:[]},settings,true),'Not running on this station')
 assert.equal(launchRestriction(demo,{mode:'local',availableDemos:['agentcore-research']},settings,true),null)
})

test('Hidden does not disable an enabled demo or enable a disabled demo',()=>{
 assert.equal(launchRestriction(demo,{mode:'hosted'},{...online,demo_enabled:{tacos:true},demo_hidden:{tacos:true}},true),null)
 assert.equal(launchRestriction(demo,{mode:'hosted'},{...online,demo_enabled:{tacos:false},demo_hidden:{tacos:true}},true),'Disabled for this station')
})
