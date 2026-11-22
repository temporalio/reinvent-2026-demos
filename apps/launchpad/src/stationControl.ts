import {useSyncExternalStore} from 'react'
import catalog from './catalog.json'

export type StationId = '1' | '2' | '3' | '4'
export type NetworkMode = 'online' | 'offline'
export type DisplaySettings = {width:number;height:number;x:number;y:number;zoom:number}
export type StationOverrides = {demo_enabled:Record<string,boolean>;network_mode?:NetworkMode}
export type StationRecord = {label:string;overrides:StationOverrides;display:DisplaySettings;last_seen:string|null}
export type ControlState = {
  revision:number
  global:{demo_enabled:Record<string,boolean>;network_mode:NetworkMode}
  stations:Record<StationId,StationRecord>
  authenticated:boolean
  server_time:string
}
export type GlobalPatch = {demo_enabled?:Record<string,boolean|null>;network_mode?:NetworkMode}
export type StationPatch = {
  label?:string
  overrides?:{demo_enabled?:Record<string,boolean|null>;network_mode?:NetworkMode|null}
  display?:DisplaySettings
}
export type EffectiveStationSettings = {label:string;demo_enabled:Record<string,boolean>;network_mode:NetworkMode;display:DisplaySettings}
export const STATION_IDS: StationId[] = ['1','2','3','4']
export const DEFAULT_DISPLAY: DisplaySettings = Object.freeze({width:90,height:78,x:0,y:0,zoom:100})
export const DISPLAY_LIMITS = {width:[40,100],height:[30,100],zoom:[50,150],x:[-7680,7680],y:[-7680,7680]} as const
const CACHE_KEY = 'reinvent-control-cache-v1'
const FALLBACK_KEY = 'reinvent-control-device-only-v1'
const STATION_KEY = 'reinvent-station-id'
const browser = typeof window !== 'undefined'
const demoIds = new Set(catalog.map(demo=>demo.id))

type ControlSource = 'hub'|'cache'|'defaults'
type Snapshot = {state:ControlState;stationId:StationId;source:ControlSource;ready:boolean;error:string|null;hasDeviceFallback:boolean}
const listeners = new Set<()=>void>()

function isRecord(value:unknown):value is Record<string,unknown> {return typeof value==='object' && value!==null && !Array.isArray(value)}
function isStation(value:unknown):value is StationId {return typeof value==='string' && STATION_IDS.includes(value as StationId)}
function mode(value:unknown):value is NetworkMode {return value==='online'||value==='offline'}
function display(value:unknown):value is DisplaySettings {
  return isRecord(value) && Object.entries(DISPLAY_LIMITS).every(([key,[min,max]])=>typeof value[key]==='number' && Number.isFinite(value[key]) && value[key]>=min && value[key]<=max)
}
function flags(value:unknown):Record<string,boolean> {
  if(!isRecord(value))throw new Error('Invalid demo settings')
  return Object.fromEntries(Object.entries(value).filter(([key,v])=>demoIds.has(key) && typeof v==='boolean')) as Record<string,boolean>
}
function decodeState(value:unknown):ControlState {
  if(!isRecord(value)||!Number.isInteger(value.revision)||Number(value.revision)<0||!isRecord(value.global)||!mode(value.global.network_mode)||!isRecord(value.stations))throw new Error('Invalid control hub state')
  const stations={} as Record<StationId,StationRecord>
  for(const id of STATION_IDS){
    const row=value.stations[id]
    if(!isRecord(row)||typeof row.label!=='string'||!row.label.trim()||row.label.length>64||!isRecord(row.overrides)||!display(row.display))throw new Error('Invalid station settings')
    if(row.overrides.network_mode!==undefined&&!mode(row.overrides.network_mode))throw new Error('Invalid network mode')
    stations[id]={label:row.label,display:{...row.display},overrides:{demo_enabled:flags(row.overrides.demo_enabled),...(mode(row.overrides.network_mode)?{network_mode:row.overrides.network_mode}:{})},last_seen:typeof row.last_seen==='string'&&Number.isFinite(Date.parse(row.last_seen))?row.last_seen:null}
  }
  return {revision:Number(value.revision),global:{demo_enabled:flags(value.global.demo_enabled),network_mode:value.global.network_mode},stations,authenticated:value.authenticated===true,server_time:typeof value.server_time==='string'?value.server_time:new Date().toISOString()}
}
function defaultState():ControlState {
  return {revision:0,global:{demo_enabled:{},network_mode:'online'},stations:Object.fromEntries(STATION_IDS.map(id=>[id,{label:`Mac Mini ${id}`,display:{...DEFAULT_DISPLAY},overrides:{demo_enabled:{}},last_seen:null}])) as Record<StationId,StationRecord>,authenticated:false,server_time:new Date().toISOString()}
}
function readStorage(key:string):unknown {try{return browser?JSON.parse(window.localStorage.getItem(key)||'null'):null}catch{return null}}
function storeStorage(key:string,value:unknown){try{if(browser)window.localStorage.setItem(key,JSON.stringify(value))}catch{/* Hub settings still work if browser storage is unavailable. */}}
function clearStorage(key:string){try{if(browser)window.localStorage.removeItem(key)}catch{/* Browser storage may be disabled. */}}
function storedStation():StationId {
  if(!browser)return '1'
  const query=new URLSearchParams(window.location.search).get('station')
  let saved:string|null=null
  try{saved=window.localStorage.getItem(STATION_KEY)}catch{/* Default station remains available. */}
  if(isStation(query)){try{window.localStorage.setItem(STATION_KEY,query)}catch{/* The URL still identifies this station if storage is unavailable. */}return query}
  return isStation(saved)?saved:'1'
}
let baseState=defaultState()
let hasCache=false
try {const cached=readStorage(CACHE_KEY);if(cached){baseState=decodeState(cached);baseState.authenticated=false;hasCache=true}}catch{/* Ignore incomplete or obsolete browser caches. */}
type DeviceStation = {label:string;display:DisplaySettings;overrides:StationOverrides}
let devicePatches:Partial<Record<StationId,DeviceStation>>={}
const storedPatches=readStorage(FALLBACK_KEY)
if(isRecord(storedPatches))for(const id of STATION_IDS){
  const patch=storedPatches[id]
  if(isRecord(patch)&&display(patch.display)&&isRecord(patch.overrides)){
    try{devicePatches[id]={display:{...patch.display},label:typeof patch.label==='string'&&patch.label.trim()&&patch.label.length<=64?patch.label:baseState.stations[id].label,overrides:{demo_enabled:flags(patch.overrides.demo_enabled),...(mode(patch.overrides.network_mode)?{network_mode:patch.overrides.network_mode}:{})}}}catch{/* Ignore invalid device-only recovery data. */}
  }
}
function patchStation(row:StationRecord,patch:StationPatch):StationRecord {
  const next={...row,label:patch.label??row.label,display:patch.display?{...patch.display}:row.display,overrides:{...row.overrides,demo_enabled:{...row.overrides.demo_enabled}}}
  for(const [key,value] of Object.entries(patch.overrides?.demo_enabled??{})){if(value===null)delete next.overrides.demo_enabled[key];else next.overrides.demo_enabled[key]=value}
  if(patch.overrides && 'network_mode' in patch.overrides){if(patch.overrides.network_mode===null)delete next.overrides.network_mode;else next.overrides.network_mode=patch.overrides.network_mode}
  return next
}
function viewState(source:ControlSource):ControlState {
  if(source==='hub')return baseState
  return {...baseState,authenticated:false,stations:Object.fromEntries(STATION_IDS.map(id=>{const device=devicePatches[id];return [id,device?{...baseState.stations[id],label:device.label,display:{...device.display},overrides:{...device.overrides,demo_enabled:{...device.overrides.demo_enabled}}}:baseState.stations[id]]})) as Record<StationId,StationRecord>}
}
let snapshot:Snapshot={state:viewState(hasCache?'cache':'defaults'),stationId:storedStation(),source:hasCache?'cache':'defaults',ready:false,error:null,hasDeviceFallback:false}
snapshot.hasDeviceFallback=Boolean(devicePatches[snapshot.stationId])
const serverSnapshot=snapshot
let timer:ReturnType<typeof setInterval>|null=null
let inFlight:Promise<void>|null=null
let writing=0
let sequence=0
let appliedSequence=0
let pendingLogout=false

function publish(changes:Partial<Snapshot>={}){
  const source=changes.source??snapshot.source
  snapshot={...snapshot,...changes,state:changes.state??viewState(source),hasDeviceFallback:source!=='hub'&&Boolean(devicePatches[(changes.stationId??snapshot.stationId)])}
  for(const listener of listeners)listener()
}
function acceptState(state:ControlState,token:number){
  if(token<appliedSequence)return
  appliedSequence=token
  baseState=pendingLogout?{...state,authenticated:false}:state
  hasCache=true
  devicePatches={}
  clearStorage(FALLBACK_KEY)
  storeStorage(CACHE_KEY,{...state,authenticated:false})
  publish({source:'hub',state:baseState,ready:true,error:null})
}
export class ControlConflictError extends Error {
  constructor(message='Settings changed elsewhere. Reload the saved settings before saving again.') {super(message);this.name='ControlConflictError'}
}
class HubError extends Error {
  status:number
  payload:unknown
  constructor(status:number,message:string,payload:unknown){super(message);this.status=status;this.payload=payload}
}
async function call(path:string,options:RequestInit={}):Promise<unknown>{
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),4000)
  try {
    const response=await fetch('/control-api'+path,{...options,credentials:'same-origin',signal:controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}})
    const payload:unknown=await response.json().catch(()=>null)
    if(!response.ok)throw new HubError(response.status,isRecord(payload)&&typeof payload.message==='string'?payload.message.slice(0,400):`Control hub request failed (${response.status})`,payload)
    return payload
  } finally {clearTimeout(timeout)}
}
function loseHub(error:unknown){
  const message=error instanceof Error&&error.name!=='AbortError'?error.message:'Control hub did not respond. Using this browser’s last settings.'
  publish({source:hasCache?'cache':'defaults',ready:true,error:message})
}
function heartbeatQuery(){
  if(!browser)return ''
  return window.location.pathname==='/config'&&!new URLSearchParams(window.location.search).has('station')?'':'?station='+snapshot.stationId
}
async function refresh():Promise<void>{
  if(writing)return
  if(inFlight)return inFlight
  const token=++sequence
  inFlight=(async()=>{
    try {
      if(pendingLogout){await call('/logout',{method:'POST',body:'{}'});pendingLogout=false}
      const state=decodeState(await call('/state'+heartbeatQuery()))
      if(!writing)acceptState(state,token)
    } catch(error){if(token>=appliedSequence&&!writing)loseHub(error)}
    finally {inFlight=null}
  })()
  return inFlight
}
function subscribe(listener:()=>void){
  listeners.add(listener)
  if(!timer){void refresh();timer=setInterval(()=>void refresh(),2000)}
  return ()=>{listeners.delete(listener);if(!listeners.size&&timer){clearInterval(timer);timer=null}}
}
function setStationId(id:StationId){
  if(!isStation(id))return
  if(browser){try{window.localStorage.setItem(STATION_KEY,id)}catch{/* Keep the current in-memory station. */}const url=new URL(window.location.href);url.searchParams.set('station',id);window.history.replaceState(null,'',url)}
  publish({stationId:id})
  void refresh()
}
async function write(path:string,body:unknown,method='POST'){
  writing++
  const token=++sequence
  appliedSequence=Math.max(appliedSequence,token)
  try {
    const state=decodeState(await call(path,{method,body:JSON.stringify(body)}))
    if(path==='/login')pendingLogout=false
    acceptState(state,token)
  } catch(error){
    if(error instanceof HubError){
      if(error.status===409){if(isRecord(error.payload)&&error.payload.state)try{acceptState(decodeState(error.payload.state),token)}catch{/* Keep the draft if the conflict response is incomplete. */}throw new ControlConflictError(error.message)}
      if(error.status===401){baseState={...baseState,authenticated:false};publish({state:viewState(snapshot.source)})}
      if(error.status>=500||error.status===404)loseHub(error)
    } else loseHub(error)
    throw error
  } finally {writing--}
}
async function login(pin:string){if(!/^\d{4}$/.test(pin))throw new Error('Enter a four-digit PIN.');await write('/login',{pin})}
async function logout(){
  pendingLogout=true
  appliedSequence=++sequence
  baseState={...baseState,authenticated:false}
  publish({state:viewState(snapshot.source)})
  try{await write('/logout',{});pendingLogout=false}catch{throw new Error('Controls are locked locally. The hub session will be ended when the connection returns.')}
}
function saveDeviceFallback(id:StationId,patch:StationPatch){
  if(snapshot.source==='hub')throw new Error('The hub is connected. Save the station settings to the hub instead.')
  if(id!==snapshot.stationId)throw new Error('Device-only changes can affect this browser’s station only.')
  const next=patchStation(snapshot.state.stations[id],patch)
  if(!display(next.display)||!next.label.trim()||next.label.length>64)throw new Error('Check the station label and display values.')
  devicePatches[id]={label:next.label,display:next.display,overrides:next.overrides}
  storeStorage(FALLBACK_KEY,devicePatches)
  publish()
}
function clearDeviceFallback(id:StationId){delete devicePatches[id];storeStorage(FALLBACK_KEY,devicePatches);publish()}
export function resolveStationSettings(state:ControlState,id:StationId):EffectiveStationSettings {
  const row=state.stations[id]
  return {label:row.label,display:row.display,network_mode:row.overrides.network_mode??state.global.network_mode,demo_enabled:Object.fromEntries(catalog.map(demo=>[demo.id,row.overrides.demo_enabled[demo.id]??state.global.demo_enabled[demo.id]??true]))}
}
export function useStationControl(){
  const current=useSyncExternalStore(subscribe,()=>snapshot,()=>serverSnapshot)
  const effective=resolveStationSettings(current.state,current.stationId)
  return {...current,station:current.stationId,effective,settings:effective,status:current.source==='hub'?'online' as const:current.source,reachable:current.source==='hub',authenticated:!pendingLogout&&current.source==='hub'&&current.state.authenticated,setStationId,refresh,login,logout,
    saveGlobal:(settings:GlobalPatch,revision:number)=>write('/global',{revision,settings},'PATCH'),
    saveStation:(id:StationId,patch:StationPatch,revision:number)=>write('/stations/'+id,{revision,...patch},'PATCH'),
    saveDeviceFallback,clearDeviceFallback}
}
