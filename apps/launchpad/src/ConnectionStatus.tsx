import {useEffect,useState} from 'react'

/** Show the active runtime, rather than equating a Wi-Fi link with internet. */
export function ConnectionStatus({local}:{local:boolean}){
 const [online,setOnline]=useState<boolean|null>(local?false:null)
 useEffect(()=>{
  let stopped=false,active:AbortController|null=null
  const check=async()=>{
   if(active)return
   active=new AbortController();const controller=active,timer=setTimeout(()=>controller.abort(),4000)
   try{
    if(new URLSearchParams(location.search).get('managed')==='1'){
     const r=await fetch('/station-status',{signal:controller.signal,cache:'no-store'}),s=await r.json()
     if(!r.ok||s.managed!==true)throw Error()
     if(!stopped)setOnline(s.mode==='online'&&s.internet===true)
    }else if(local){if(!stopped)setOnline(false)}else{
     const r=await fetch('/runtime-config.json',{signal:controller.signal,cache:'no-store'}),s=await r.json()
     if(!stopped)setOnline(r.ok&&s.mode==='hosted')
    }
   }catch{if(!stopped)setOnline(false)}finally{clearTimeout(timer);if(active===controller)active=null}
  }
  void check();const timer=setInterval(()=>void check(),10000)
  return()=>{stopped=true;clearInterval(timer);active?.abort()}
 },[local])
 const label=online===null?'Checking connection':local?'Offline — local demos':online?'Online — hosted demos':'Hosted demos selected — connection unavailable'
 return <span className="connection-status" role="img" aria-label={label} title={label} data-online={online===true}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/>{online===false&&<path d="M3 3l18 18"/>}</svg></span>
}
