import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=readFileSync(resolve(root,'src/stationControl.ts'),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText
const catalog=JSON.parse(readFileSync(resolve(root,'src/catalog.json'),'utf8'))
const display={width:90,height:78,x:0,y:0,zoom:100}
function state(revision=9){return {revision,global:{demo_enabled:{tacos:true},network_mode:'online'},stations:Object.fromEntries(['1','2','3','4'].map(id=>[id,{label:'Mac Mini '+id,display:{...display},overrides:{demo_enabled:{}},last_seen:null}])),authenticated:false,server_time:'2026-11-21T12:00:00Z'}}
function load({url='http://booth.invalid/?station=1',storage=new Map(),fetch=async()=>{throw Error('Hub unavailable')}}={}){
  const location=new URL(url)
  const exports={}
  const context={exports,module:{exports},require(name){if(name==='react')return {useSyncExternalStore:(_subscribe,getSnapshot)=>getSnapshot()};if(name==='./catalog.json')return catalog;throw Error('Unexpected import: '+name)},window:{location,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},history:{replaceState:(_state,_title,next)=>{location.href=String(next)}}},URL,URLSearchParams,Date,Intl,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,fetch,console}
  vm.runInNewContext(code,context,{filename:'stationControl.cjs'})
  return {api:exports,get:()=>exports.useStationControl(),storage}
}
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value})

test('explicit station URL persists through a screensaver full-page launch',()=>{
  const storage=new Map()
  assert.equal(load({url:'http://booth.invalid/?station=3',storage}).get().stationId,'3')
  assert.equal(load({url:'http://booth.invalid/?demo=tacos',storage}).get().stationId,'3')
})

test('cached control settings never restore hub authentication',()=>{
  const cached=state();cached.authenticated=true
  const {get}=load({storage:new Map([['reinvent-control-cache-v1',JSON.stringify(cached)]])})
  assert.equal(get().state.authenticated,false)
  assert.equal(get().authenticated,false)
  assert.equal(get().source,'cache')
})

test('offline Inherit removes cached demo and network overrides, including after reload',()=>{
  const cached=state();cached.stations['1'].overrides={demo_enabled:{tacos:false},network_mode:'offline'}
  const storage=new Map([['reinvent-control-cache-v1',JSON.stringify(cached)]])
  const {get}=load({storage})
  assert.equal(get().effective.demo_enabled.tacos,false)
  get().saveDeviceFallback('1',{overrides:{demo_enabled:{tacos:null},network_mode:null}})
  assert.equal(get().effective.demo_enabled.tacos,true)
  assert.equal(get().effective.network_mode,'online')
  const reloaded=load({storage}).get()
  assert.equal(reloaded.effective.demo_enabled.tacos,true)
  assert.equal(reloaded.effective.network_mode,'online')
  assert.equal(reloaded.authenticated,false)
})

test('backup hub can replace a cached higher revision and clears device-only overrides',async()=>{
  const storage=new Map([['reinvent-control-cache-v1',JSON.stringify(state(9))]])
  const fresh=state(0);fresh.global.demo_enabled.tacos=false
  const {get}=load({storage,fetch:async()=>response(fresh)})
  get().saveDeviceFallback('1',{display:{...display,width:60}})
  assert.equal(get().effective.display.width,60)
  await get().refresh()
  assert.equal(get().state.revision,0)
  assert.equal(get().source,'hub')
  assert.equal(get().effective.display.width,90)
  assert.equal(get().effective.demo_enabled.tacos,false)
  assert.equal(storage.has('reinvent-control-device-only-v1'),false)
})

test('controller-only config page does not impersonate a station heartbeat',async()=>{
  const requests=[]
  const {get}=load({url:'http://booth.invalid/config',fetch:async path=>{requests.push(path);return response(state())}})
  await get().refresh()
  assert.equal(requests[0],'/control-api/state')
})

test('a slow pre-login poll cannot overwrite a successful authenticated response',async()=>{
  let resolvePoll
  const loggedIn=state(2);loggedIn.authenticated=true
  const {get}=load({fetch:path=>path.includes('/state')?new Promise(resolve=>{resolvePoll=resolve}):Promise.resolve(response(loggedIn))})
  const poll=get().refresh()
  await get().login('1121')
  resolvePoll(response(state(1)))
  await poll
  assert.equal(get().authenticated,true)
  assert.equal(get().state.revision,2)
})

test('stale writes expose the new state and never apply the rejected draft',async()=>{
  const latest=state(10);latest.authenticated=true
  const {get,api}=load({storage:new Map([['reinvent-control-cache-v1',JSON.stringify(state(9))]]),fetch:async()=>response({error:'stale_revision',message:'Changed elsewhere',state:latest},409)})
  await assert.rejects(()=>get().saveStation('1',{display:{...display,width:40}},9),error=>error instanceof api.ControlConflictError)
  assert.equal(get().state.revision,10)
  assert.equal(get().effective.display.width,90)
})


test('a failed logout stays locked when an older authenticated poll arrives',async()=>{
  const authenticated=state(2);authenticated.authenticated=true
  let reads=0
  let resolvePoll
  const {get}=load({fetch:async path=>{
    if(path.endsWith('/logout'))throw Error('Hub unavailable')
    reads++
    if(reads===1)return response(authenticated)
    return new Promise(resolve=>{resolvePoll=resolve})
  }})
  await get().refresh()
  assert.equal(get().authenticated,true)
  const poll=get().refresh()
  await assert.rejects(()=>get().logout(),/locked locally/)
  assert.equal(get().authenticated,false)
  resolvePoll(response(authenticated))
  await poll
  assert.equal(get().authenticated,false)
  assert.equal(get().state.authenticated,false)
})


test('live authenticated responses are persisted only as unauthenticated cache',async()=>{
  const authenticated=state(2);authenticated.authenticated=true
  const storage=new Map()
  const {get}=load({storage,fetch:async()=>response(authenticated)})
  await get().login('1121')
  assert.equal(get().authenticated,true)
  assert.equal(JSON.parse(storage.get('reinvent-control-cache-v1')).authenticated,false)
  assert.ok(!JSON.stringify([...storage]).includes('1121'))
})

test('legacy display caches default workflow zoom without discarding geometry',()=>{
 const cached=state();cached.stations['3'].display.width=82
 const {get}=load({url:'http://booth.invalid/?station=3',storage:new Map([['reinvent-control-cache-v1',JSON.stringify(cached)]])})
 assert.equal(get().effective.display.temporal_ui_zoom,100)
 assert.equal(get().effective.display.width,82)
})
test('remote workflow zoom applies only to the selected station and survives cached reload',async()=>{
 const saved=state(10);saved.stations['2'].display.temporal_ui_zoom=80
 const storage=new Map()
 const station2=load({url:'http://booth.invalid/?station=2',storage,fetch:async()=>response(saved)})
 await station2.get().refresh()
 assert.equal(station2.get().effective.display.temporal_ui_zoom,80)
 const station1=load({url:'http://booth.invalid/?station=1',fetch:async()=>response(saved)})
 await station1.get().refresh()
 assert.equal(station1.get().effective.display.temporal_ui_zoom,100)
 assert.equal(station2.get().effective.display.zoom,100)
 const reloaded=load({url:'http://booth.invalid/?station=2',storage})
 assert.equal(reloaded.get().effective.display.temporal_ui_zoom,80)
 reloaded.get().saveDeviceFallback('2',{display:{...display,width:75}})
 assert.equal(reloaded.get().effective.display.temporal_ui_zoom,80)
})

test('global display changes flow through while per-station fields stay overridden',async()=>{
 const first=state();first.global.display={...display,temporal_ui_zoom:90,width:94}
 for(const row of Object.values(first.stations))row.display_overrides={}
 first.stations['2'].display_overrides={width:82,temporal_ui_zoom:70}
 const next=JSON.parse(JSON.stringify(first));next.revision++;next.global.display.width=96;next.global.display.temporal_ui_zoom=80
 const storage=new Map();let saved=first
 const client=load({url:'http://booth.invalid/?station=2',storage,fetch:async()=>response(saved)})
 await client.get().refresh()
 assert.equal(client.get().effective.display.width,82)
 assert.equal(client.get().state.stations['1'].display.width,94)
 saved=next;await client.get().refresh()
 assert.equal(client.get().effective.display.width,82)
 assert.equal(client.get().effective.display.temporal_ui_zoom,70)
 assert.equal(client.get().state.stations['1'].display.width,96)
 const offline=load({url:'http://booth.invalid/?station=2',storage})
 offline.get().saveDeviceFallback('2',{display:{width:null,temporal_ui_zoom:null}})
 assert.equal(offline.get().effective.display.width,96)
 assert.equal(offline.get().effective.display.temporal_ui_zoom,80)
 const reloaded=load({url:'http://booth.invalid/?station=2',storage})
 assert.equal(reloaded.get().effective.display.width,96)
 assert.equal(reloaded.get().effective.display.temporal_ui_zoom,80)
})
test('hub loss retains inherited settings and overrides, then reconnects without a reload',async()=>{
 const saved=state();saved.global.display={...display,temporal_ui_zoom:90,width:94}
 for(const row of Object.values(saved.stations))row.display_overrides={}
 saved.stations['1'].display_overrides={width:82}
 let online=true
 const storage=new Map()
 const client=load({storage,fetch:async()=>{if(!online)throw Error('Laptop disconnected');return response(saved)}})
 await client.get().refresh()
 online=false;await client.get().refresh()
 assert.equal(client.get().source,'cache')
 assert.equal(client.get().ready,true)
 assert.equal(client.get().effective.display.width,82)
 assert.equal(client.get().effective.display.temporal_ui_zoom,90)
 const reloaded=load({storage});await reloaded.get().refresh()
 assert.equal(reloaded.get().effective.display.width,82)
 assert.equal(reloaded.get().effective.display.temporal_ui_zoom,90)
 saved.global.display.temporal_ui_zoom=80;online=true;await client.get().refresh()
 assert.equal(client.get().source,'hub')
 assert.equal(client.get().effective.display.width,82)
 assert.equal(client.get().effective.display.temporal_ui_zoom,80)
})
test('first startup without laptop or cache becomes ready with built-in defaults',async()=>{
 const client=load();await client.get().refresh()
 assert.equal(client.get().ready,true)
 assert.equal(client.get().source,'defaults')
 assert.equal(client.get().effective.display.width,90)
 assert.equal(client.get().effective.display.temporal_ui_zoom,100)
})

test('remote previews do not become cached saved layouts',async()=>{
 const live=state();live.display_previews={'1':{...display,temporal_ui_zoom:100,width:61}}
 const storage=new Map();const client=load({storage,fetch:async()=>response(live)})
 await client.get().refresh()
 assert.equal(client.get().effective.display.width,61)
 assert.equal(client.get().state.stations['1'].display.width,90)
 const rebooted=load({storage})
 assert.equal(rebooted.get().effective.display.width,90)
 live.display_previews={};await client.get().refresh()
 assert.equal(client.get().effective.display.width,90)
})

test('loaded controller defaults survive refresh and offline load; remote commit wins',async()=>{
 const profile={...display,temporal_ui_zoom:90,width:73,x:40}
 const saved=state();saved.iframe_defaults=profile;saved.device_read_only=true
 const storage=new Map();let online=true
 const fetch=async path=>{if(!online)throw Error('Laptop offline');return response(path.includes('iframe-defaults')?{display:profile}:saved)}
 const client=load({storage,fetch});await client.get().refresh()
 assert.equal(await client.get().loadIframeDefaults(),false)
 assert.equal(client.get().effective.display.width,73)
 await client.get().refresh();assert.equal(client.get().effective.display.width,73)
 online=false
 const rebooted=load({storage,fetch});await rebooted.get().refresh()
 assert.equal(await rebooted.get().loadIframeDefaults(),true)
 assert.equal(rebooted.get().effective.display.x,40)
 online=true;saved.display_generations={'1':1};saved.stations['1'].display_overrides={width:81}
 await rebooted.get().refresh()
 assert.equal(rebooted.get().effective.display.width,81)
})

test('controller and managed booth roles remain distinct',async()=>{
 const controller=load({url:'http://localhost:15102/config'})
 assert.equal(controller.get().isController,true)
 const booth=load({url:'http://localhost:15103/config?station=2&managed=1'})
 assert.equal(booth.get().isController,false)
})

test('visibility inherits and caches independently of On/Off',async()=>{
 const saved=state();saved.global.demo_hidden={tacos:true};saved.stations['2'].overrides.demo_hidden={tacos:false}
 const storage=new Map();let connected=true
 const client=load({storage,fetch:async()=>{if(!connected)throw Error('offline');return response(saved)}})
 await client.get().refresh()
 assert.equal(client.get().effective.demo_hidden.tacos,true)
 assert.equal(client.get().effective.demo_enabled.tacos,true)
 client.get().setStationId('2')
 assert.equal(client.get().effective.demo_hidden.tacos,false)
 assert.equal(client.get().effective.demo_enabled.tacos,true)
 connected=false;await client.get().refresh()
 const reboot=load({storage,url:'http://booth.invalid/?station=2'});await reboot.get().refresh()
 assert.equal(reboot.get().effective.demo_hidden.tacos,false)
 reboot.get().setStationId('1')
 assert.equal(reboot.get().effective.demo_hidden.tacos,true)
 assert.equal(reboot.get().effective.demo_enabled.tacos,true)
})
