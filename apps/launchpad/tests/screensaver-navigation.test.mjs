import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {initialLaunchScreen} from '../src/launchNavigation.ts'
const source=readFileSync(new URL('../public/screensaver/navigation.js',import.meta.url),'utf8')
function navigation(embedded,search='') {
  const events=[],details=[],destinations=[]
  const window={location:{origin:'http://booth.local',search,assign:url=>destinations.push(url)}}
  window.parent=embedded?{}:window
  runInNewContext(source,{window,document:{dispatchEvent:event=>{events.push(event.type);details.push(event.detail)}},CustomEvent:class {constructor(type,options={}){this.type=type;this.detail=options.detail}},URL,URLSearchParams})
  return {exit:window.boothExitScreensaver,launch:window.boothLaunchDemo,events,details,destinations}
}
test('embedded background exits emit crew event without replacing the parent',()=>{
  const instance=navigation(true,'?demo=tacos&station=3')
  instance.exit()
  assert.deepEqual(instance.events,['reinvent:exit'])
  assert.deepEqual(instance.destinations,[])
})
test('standalone exit selects crew and retains only a valid station identity',()=>{
  for(const station of ['1','2','3','4']) {
    const instance=navigation(false,`?demo=tacos&station=${station}`)
    instance.exit()
    const url=new URL(instance.destinations[0])
    assert.equal(url.searchParams.get('screen'),'crew')
    assert.equal(url.searchParams.get('station'),station)
    assert.equal(url.searchParams.has('demo'),false)
  }
  const invalid=navigation(false,'?station=other');invalid.exit()
  assert.equal(new URL(invalid.destinations[0]).searchParams.has('station'),false)
})
test('crew destination wins over stale deep links while explicit demo URLs still work',()=>{
  assert.equal(initialLaunchScreen('?screen=crew&demo=tacos',true),'crew')
  assert.equal(initialLaunchScreen('?screen=crew',false),'crew')
  assert.equal(initialLaunchScreen('?demo=tacos',true),'demo')
  assert.equal(initialLaunchScreen('',false),'screensaver')
})

test('planet launch selects the demo directly and preserves station identity',()=>{
 const embedded=navigation(true);embedded.launch('tacos');assert.deepEqual(embedded.events,['reinvent:launch']);assert.equal(embedded.details[0].demoId,'tacos');assert.deepEqual(embedded.destinations,[])
 const standalone=navigation(false,'?screen=crew&station=4');standalone.launch('agentcore-video');const url=new URL(standalone.destinations[0]);assert.equal(url.searchParams.get('demo'),'agentcore-video');assert.equal(url.searchParams.get('station'),'4');assert.equal(url.searchParams.has('screen'),false)
 standalone.launch('https://invalid.example');assert.equal(standalone.destinations.length,1)
})
