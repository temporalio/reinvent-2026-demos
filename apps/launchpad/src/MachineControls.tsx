import {useEffect,useRef,useState} from 'react'
import type {StationId} from './stationControl'

type MachineStatus={status?:{mode?:string;preference?:string;error?:string;ack?:string;browser_running?:boolean};last_seen:number|null;command?:{id:string;kind:string;expires:number}}
type Fleet={stations:Partial<Record<StationId,MachineStatus>>;server_time:number}
function bytesHex(value:ArrayBuffer){return [...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function request(key:string,body:unknown):Promise<Fleet>{
 if(!/^[a-f0-9]{64}$/.test(key))throw Error('Enter the laptop’s 64-character machine operator key.')
 if(!window.crypto?.subtle)throw Error('Open the laptop controls at localhost or HTTPS to use machine commands.')
 const path='/control-api/machines/operator',time=Math.floor(Date.now()/1000),nonce=bytesHex(crypto.getRandomValues(new Uint8Array(16)).buffer),payload=JSON.stringify(body)
 const cryptoKey=await crypto.subtle.importKey('raw',new Uint8Array(key.match(/../g)!.map(x=>parseInt(x,16))),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])
 const encode=(verb:string,at:number,content:string)=>new TextEncoder().encode(`${verb}\n${path}\n${at}\n${nonce}\n${content}`)
 const signature=bytesHex(await crypto.subtle.sign('HMAC',cryptoKey,encode('POST',time,payload)))
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500)
 try{
  const result=await fetch(path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({time,nonce,payload,signature}),signal:controller.signal})
  const reply=await result.json()
  if(!result.ok)throw Error(reply.message||'Machine control is unavailable on this hub.')
  if(reply.nonce!==nonce||Math.abs(Date.now()/1000-reply.time)>60||typeof reply.signature!=='string'||!/^[a-f0-9]{64}$/.test(reply.signature)||!await crypto.subtle.verify('HMAC',cryptoKey,new Uint8Array(reply.signature.match(/../g)!.map((x:string)=>parseInt(x,16))),encode('REPLY',reply.time,reply.payload)))throw Error('Machine control reply could not be verified.')
  return JSON.parse(reply.payload) as Fleet
 }finally{clearTimeout(timer)}
}

/** Native machine commands require a laptop-only key, not the attendee PIN. */
export function MachineControls({target}:{target:'global'|StationId}){
 const [key,setKey]=useState(''),[unlocked,setUnlocked]=useState(false),[fleet,setFleet]=useState<Fleet|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<string|null>(null)
 const inFlight=useRef(false)
 // Keep the operator key out of station screens, saved config, URLs and storage.
 const laptop=location.pathname==='/config'&&!new URLSearchParams(location.search).has('station')
 useEffect(()=>{setConfirm(null)},[target])
 useEffect(()=>{
  if(!unlocked)return
  let disposed=false
  const refresh=async()=>{
   if(inFlight.current)return;inFlight.current=true
   try{const next=await request(key,{action:'status'});if(!disposed){setFleet(next);setError('')}}catch(e){if(!disposed)setError(e instanceof Error?e.message:'Control laptop disconnected.')}finally{inFlight.current=false}
  }
  void refresh();const timer=setInterval(()=>void refresh(),3000)
  return()=>{disposed=true;clearInterval(timer)}
 },[key,unlocked])
 async function unlock(){setBusy(true);setError('');try{setFleet(await request(key,{action:'status'}));setUnlocked(true)}catch(e){setError(e instanceof Error?e.message:'Could not unlock machine controls.')}finally{setBusy(false)}}
 async function send(kind:string){setBusy(true);setError('');try{setFleet(await request(key,{action:'command',target:target==='global'?'all':target,kind}));setConfirm(null)}catch(e){setError(e instanceof Error?e.message:'Command was not sent.')}finally{setBusy(false)}}
 if(!laptop)return null
 const ids:StationId[]=target==='global'?['1','2','3','4']:[target]
 return <section className="control-card machine-controls"><h3>Station supervisor</h3><p className="control-muted">These commands control the Mac’s dedicated booth browser and switch its actual runtime. They require the macOS supervisor and reach stations over the LAN without internet. Commands expire after two minutes.</p>
 {!unlocked?<><label>Laptop-only operator key<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e=>setKey(e.target.value.trim())}/></label><button type="button" disabled={busy||key.length!==64} onClick={()=>void unlock()}>Unlock machine controls</button><p className="control-muted">Read tmp/station-pairing/operator.key on your laptop. Do not copy this key to a station. It stays in memory until you lock or leave this page.</p></>:<>
 {ids.map(id=>{const row=fleet?.stations[id],fresh=!!row?.last_seen&&Date.now()/1000-row.last_seen<12;return <p key={id}><strong>Station {id}</strong>: {fresh?`${row?.status?.mode||'starting'} · browser ${row?.status?.browser_running?'running':'stopped'}`:'Supervisor not connected'}{row?.command&&row.command.expires>Date.now()/1000&&row.status?.ack!==row.command.id?' · command pending':''}{fresh&&row?.status?.error&&<span role="status"> · {row.status.error}</span>}</p>})}
 <div className="control-choice" role="group" aria-label="Native station actions">{[['online','Run online'],['offline','Run locally / offline'],['auto','Choose available runtime'],['restart','Restart booth Chrome']].map(([kind,label])=><button type="button" key={kind} disabled={busy} onClick={()=>setConfirm(kind)}>{label}</button>)}</div>
 {confirm&&<div role="alert"><p>{confirm==='restart'?'Restart the booth browser':`Switch the actual demo runtime (${confirm})`} on {target==='global'?'all four stations':`station ${target}`}? The current screen will close; recorded Workflows remain in their original runtime.</p><button type="button" disabled={busy} onClick={()=>void send(confirm)}>Confirm</button><button type="button" onClick={()=>setConfirm(null)}>Cancel</button></div>}
 <button type="button" onClick={()=>{setUnlocked(false);setKey('');setFleet(null)}}>Lock machine controls</button></>}
 {error&&<p role="alert" className="control-error">{error}</p>}
 </section>
}
