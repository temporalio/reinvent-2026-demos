import {useEffect, useRef, useState, type FormEvent} from 'react'
import catalog from './catalog.json'
import {ControlConflictError, DEFAULT_DISPLAY, DISPLAY_LIMITS, STATION_IDS, resolveStationSettings, useStationControl, type ControlState, type DisplaySettings, type NetworkMode, type StationId, type StationPatch} from './stationControl'
import './control.css'
import {StationPreview} from './StationPreview'

type Target = 'global'|StationId
type Choice = 'inherit'|'on'|'off'
type Draft = {revision:number;label:string;demo_enabled:Record<string,Choice>;network_mode:NetworkMode|'inherit';display:DisplaySettings}

function fromState(state:ControlState,target:Target):Draft {
  const row=target==='global'?null:state.stations[target]
  return {revision:state.revision,label:row?.label??'All stations',display:{...(row?.display??DEFAULT_DISPLAY)},network_mode:row?.overrides.network_mode??(row?'inherit':state.global.network_mode),demo_enabled:Object.fromEntries(catalog.map(demo=>{
    const value=row?row.overrides.demo_enabled[demo.id]:state.global.demo_enabled[demo.id]??true
    return [demo.id,value===undefined?'inherit':value?'on':'off']
  }))}
}
function presence(value:string|null,now:number){
  if(!value)return 'Not seen yet'
  const seconds=Math.max(0,Math.floor((now-Date.parse(value))/1000))
  return seconds<10?'Seen just now':seconds<60?`Last seen ${seconds}s ago`:`Last seen ${Math.floor(seconds/60)}m ago`
}
function fallbackPin(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  return (parts.find(part=>part.type==='month')?.value??'')+(parts.find(part=>part.type==='day')?.value??'')
}
const choiceValue=(choice:Choice)=>choice==='inherit'?null:choice==='on'

export default function StationControl({onExit}:{onExit?:()=>void}={}){
  const control=useStationControl()
  const [target,setTarget]=useState<Target>(control.stationId)
  const [draft,setDraft]=useState(()=>fromState(control.state,control.stationId))
  const [dirty,setDirty]=useState(false)
  const [pin,setPin]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState<string|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [conflict,setConflict]=useState(false)
  const [deviceUnlocked,setDeviceUnlocked]=useState(false)
  const [step,setStep]=useState(10)
  const [keyboard,setKeyboard]=useState(false)
  const [preview,setPreview]=useState(false)
  const [pendingTarget,setPendingTarget]=useState<Target|null>(null)
  const [pendingExit,setPendingExit]=useState(false)
  const confirmDialog=useRef<HTMLDialogElement>(null)
  const [setupStation,setSetupStation]=useState<StationId>(control.stationId)
  const allowed=control.authenticated||(!control.reachable&&deviceUnlocked)
  const fallback=!control.reachable
  const wrongDevice=fallback&&target!==control.stationId
  const changedElsewhere=dirty&&control.reachable&&draft.revision!==control.state.revision
  const invalidLabel=target!=='global'&&!draft.label.trim()
  const station=target==='global'?null:control.state.stations[target]
  const effective=target==='global'?null:resolveStationSettings(control.state,target)

  useEffect(()=>{
    if(!dirty){setDraft(fromState(control.state,target));setConflict(false)}
  },[control.state,target,dirty])
  useEffect(()=>{if(control.reachable)setDeviceUnlocked(false)},[control.reachable])
  useEffect(()=>setSetupStation(control.stationId),[control.stationId])

  useEffect(()=>{const dialog=confirmDialog.current;if(!dialog)return;if(pendingTarget!==null||pendingExit){if(!dialog.open)dialog.showModal()}else if(dialog.open)dialog.close()},[pendingTarget,pendingExit])

  function update(patch:Partial<Draft>){setDraft(previous=>({...previous,...patch}));setDirty(true);setMessage(null);setError(null)}
  function geometry(key:keyof DisplaySettings,value:number){const [min,max]=DISPLAY_LIMITS[key];update({display:{...draft.display,[key]:Math.max(min,Math.min(max,value))}})}
  function exit(){if(onExit)onExit();else window.location.assign('/?station='+control.stationId)}
  function selectTarget(next:Target){if(next===target)return;if(dirty){setPendingTarget(next);return}setTarget(next);setError(null);setMessage(null);setKeyboard(false)}
  function discard(){setDirty(false);setConflict(false);setError(null);setMessage(null);void control.refresh()}
  async function unlock(event:FormEvent){
    event.preventDefault();setBusy(true);setError(null);setMessage(null)
    try {
      if(fallback){if(pin!==fallbackPin())throw new Error('That PIN did not match today’s date in the booth timezone.');setDeviceUnlocked(true)}
      else await control.login(pin)
    }catch(cause){setError(cause instanceof Error?cause.message:'Controls could not be unlocked.')}
    finally{setPin('');setBusy(false)}
  }
  async function save(){
    if(wrongDevice)return
    setBusy(true);setError(null);setMessage(null)
    try {
      const demos=Object.fromEntries(Object.entries(draft.demo_enabled).map(([id,value])=>[id,choiceValue(value)]))
      if(target==='global')await control.saveGlobal({demo_enabled:demos,network_mode:draft.network_mode as NetworkMode},draft.revision)
      else {
        const patch:StationPatch={label:draft.label.trim(),display:{...draft.display},overrides:{demo_enabled:demos,network_mode:draft.network_mode==='inherit'?null:draft.network_mode}}
        if(fallback)control.saveDeviceFallback(target,patch)
        else await control.saveStation(target,patch,draft.revision)
      }
      setDirty(false);setConflict(false);setMessage(fallback?'Saved on this browser only. The hub’s settings will replace these when it reconnects.':'Saved. Connected stations will pick up the change shortly.')
    }catch(cause){setConflict(cause instanceof ControlConflictError);setError(cause instanceof Error?cause.message:'Settings could not be saved.')}
    finally{setBusy(false)}
  }
  async function lock(){setPin('');setDeviceUnlocked(false);setError(null);try{await control.logout()}catch(cause){setError(cause instanceof Error?cause.message:'Controls are locked locally.')}}

  if(preview&&allowed&&target!=='global')return <StationPreview display={draft.display} label={draft.label || `Station ${target}`} onBack={()=>setPreview(false)}/>

  return <div className="station-control">
    <header className="control-header"><div><p className="eyebrow">STAFF / BOOTH CONTROLS</p><h1>Mission control</h1></div><button type="button" onClick={()=>dirty?setPendingExit(true):exit()}>Back to launchpad</button></header>
    <div className="control-connection" data-source={control.source} role="status"><strong>{!control.ready?'Connecting to control hub…':control.reachable?'Hub connected':control.source==='cache'?'Using cached hub settings':'Using default settings'}</strong><span>{!control.ready?'Loading the saved station settings.':control.reachable?'Changes can reach all four stations.':'The hub is unavailable. Recovery edits apply only to this browser.'}</span>{control.error&&<span>{control.error}</span>}</div>
    {allowed&&<details className="control-setup"><summary>This browser: station {control.stationId} · station setup</summary><p>Use this only to identify a station browser. The tabs below manage stations without changing this browser’s identity.</p><label>Station identity<select value={setupStation} onChange={event=>setSetupStation(event.target.value as StationId)}>{STATION_IDS.map(id=><option key={id} value={id}>Station {id} · {control.state.stations[id].label}</option>)}</select></label><button type="button" onClick={()=>{control.setStationId(setupStation);setMessage('This browser is now station '+setupStation+'.')}}>Use station {setupStation} on this browser</button></details>}
    {error&&<p className="control-error" role="alert">{error}</p>}
    {message&&<p className="control-message" role="status">{message}</p>}
    {!allowed?<section className="control-unlock" aria-labelledby="control-unlock-title"><h2 id="control-unlock-title">{fallback?'Device-only recovery':'Unlock station controls'}</h2><p>{fallback?'Enter today’s date PIN to edit this browser’s station. This does not sign in to the hub. Temporary settings are replaced when the hub returns.':'Enter the four-digit staff PIN. The default uses the booth date: month, then day.'}</p><form onSubmit={unlock}><label htmlFor="control-pin">Staff PIN</label><input id="control-pin" type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={4} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,4))} aria-describedby="control-pin-note"/><div className="control-pinpad" aria-label="PIN keypad">{['1','2','3','4','5','6','7','8','9','clear','0','back'].map(value=><button type="button" key={value} disabled={busy} aria-label={value==='back'?'Delete last PIN digit':value==='clear'?'Clear PIN':'PIN digit '+value} onClick={()=>setPin(previous=>value==='clear'?'':value==='back'?previous.slice(0,-1):(previous+value).slice(0,4))}>{value==='back'?'⌫':value==='clear'?'Clear':value}</button>)}</div><button className="control-primary" type="submit" disabled={busy||pin.length!==4||!control.ready}>{busy?'Checking…':fallback?'Unlock device-only controls':'Unlock controls'}</button><p id="control-pin-note" className="control-muted">Your PIN is not saved by this app.</p></form></section>:<>
      <nav className="control-targets" aria-label="Configuration target"><button type="button" aria-current={target==='global'?'page':undefined} disabled={busy||(fallback&&target!=='global')} onClick={()=>selectTarget('global')}>All stations</button>{STATION_IDS.map(id=><button type="button" key={id} aria-current={target===id?'page':undefined} disabled={busy||(fallback&&id!==control.stationId)} onClick={()=>selectTarget(id)}><strong>Station {id}</strong><span>{control.state.stations[id].label}</span><small>{presence(control.state.stations[id].last_seen,Date.now())}</small></button>)}</nav>
      <section className="control-target-heading"><div><p className="eyebrow">{target==='global'?'GLOBAL DEFAULTS':`STATION ${target} / ${station?.label}`}</p><h2>{target==='global'?'Defaults for every station':fallback?'Device-only station settings':'Station settings'}</h2></div><button type="button" onClick={()=>void lock()}>Lock controls</button></section>
      {fallback&&<aside className="control-warning" role="status">Device-only recovery. Only station {control.stationId} on this browser can be changed. These values do not update other screens and are discarded when the hub reconnects.</aside>}
      {wrongDevice&&<p className="control-warning">This draft belongs to another target. Reconnect to save it, or discard it and select this browser’s station.</p>}
      {(changedElsewhere||conflict)&&<aside className="control-warning" role="alert"><p>Saved settings changed while you were editing. Your draft has been kept. Reload the saved settings before saving again.</p><button type="button" onClick={discard}>Discard draft & reload saved settings</button></aside>}
      <fieldset className="control-fields" disabled={busy||wrongDevice}>
        {target!=='global'&&<section className="control-card"><h3>Station label</h3><label htmlFor="control-label">Label<input id="control-label" type="text" value={draft.label} maxLength={64} onChange={event=>update({label:event.target.value})}/></label>{invalidLabel&&<p className="control-error">Enter a station label.</p>}<button type="button" aria-expanded={keyboard} onClick={()=>setKeyboard(!keyboard)}>Touch keyboard</button>{keyboard&&<div className="control-keyboard" role="group" aria-label="Station label keyboard">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split('').map(character=><button type="button" key={character} onClick={()=>update({label:(draft.label+character).slice(0,64)})}>{character}</button>)}<button type="button" className="control-keyboard-wide" onClick={()=>update({label:(draft.label+' ').slice(0,64)})}>Space</button><button type="button" onClick={()=>update({label:draft.label.slice(0,-1)})} aria-label="Delete last label character">⌫</button><button type="button" onClick={()=>update({label:''})}>Clear</button><button type="button" onClick={()=>setKeyboard(false)}>Done</button></div>}</section>}
        <section className="control-card"><h3>Demo availability</h3><p className="control-muted">{target==='global'?'These defaults apply wherever a station inherits its setting.':'On and Off override the global default. Inherit follows it. Existing demos keep running; changes affect new launches.'}</p><div className="control-demo-list">{catalog.map(demo=><div className="control-demo-row" key={demo.id}><div><strong>{demo.title}</strong>{target!=='global'&&<small>Global: {(control.state.global.demo_enabled[demo.id]??true)?'On':'Off'} · Effective: {(draft.demo_enabled[demo.id]==='inherit'?(control.state.global.demo_enabled[demo.id]??true):draft.demo_enabled[demo.id]==='on')?'On':'Off'}</small>}</div><div className="control-choice" role="group" aria-label={demo.title+' availability'}>{(target==='global'?['on','off']:['on','off','inherit']).map(value=><button type="button" key={value} aria-pressed={draft.demo_enabled[demo.id]===value} onClick={()=>update({demo_enabled:{...draft.demo_enabled,[demo.id]:value as Choice}})}>{value==='inherit'?'Inherit':value==='on'?'On':'Off'}</button>)}</div></div>)}</div></section>
        <section className="control-card"><h3>Network policy</h3><div className="control-choice" role="group" aria-label="Network mode">{(target==='global'?['online','offline']:['online','offline','inherit']).map(value=><button type="button" key={value} aria-pressed={draft.network_mode===value} onClick={()=>update({network_mode:value as Draft['network_mode']})}>{value==='inherit'?'Inherit':value==='online'?'Online':'Offline'}</button>)}</div><p className="control-muted">Offline policy limits new launches to locally supported demos. It does not start missing services or reconnect workers to another Temporal server.{effective&&` Current station policy: ${effective.network_mode}.`}</p></section>
        {target!=='global'&&<section className="control-card"><h3>Demo area</h3><div className="control-sliders">{(['width','height','zoom'] as const).map(key=><label key={key} htmlFor={'control-'+key}><span>{key==='zoom'?'Content zoom':key==='width'?'Area width':'Area height'}<output>{draft.display[key]}%</output></span><input id={'control-'+key} type="range" min={DISPLAY_LIMITS[key][0]} max={DISPLAY_LIMITS[key][1]} step={1} value={draft.display[key]} onChange={event=>geometry(key,Number(event.target.value))}/><div className="control-step-buttons"><button type="button" aria-label={'Decrease '+key} onClick={()=>geometry(key,draft.display[key]-1)}>−</button><button type="button" aria-label={'Increase '+key} onClick={()=>geometry(key,draft.display[key]+1)}>+</button></div></label>)}</div><div className="control-position"><div><p>Move the demo area</p><div className="control-choice" role="group" aria-label="Movement step">{[5,10,25,50].map(value=><button type="button" key={value} aria-pressed={step===value} onClick={()=>setStep(value)}>{value}px</button>)}</div><p className="control-position-readout">Horizontal: {draft.display.x}px · Vertical: {draft.display.y}px</p></div><div className="control-dpad" role="group" aria-label="Move demo area"><button type="button" className="control-up" aria-label="Move demo area up" onClick={()=>geometry('y',draft.display.y-step)}>↑</button><button type="button" className="control-left" aria-label="Move demo area left" onClick={()=>geometry('x',draft.display.x-step)}>←</button><button type="button" className="control-center" aria-label="Center demo area" onClick={()=>update({display:{...draft.display,x:0,y:0}})}>Center</button><button type="button" className="control-right" aria-label="Move demo area right" onClick={()=>geometry('x',draft.display.x+step)}>→</button><button type="button" className="control-down" aria-label="Move demo area down" onClick={()=>geometry('y',draft.display.y+step)}>↓</button></div></div><p className="control-muted">Width and height use the space between the screen’s header and navigation. Movement is clamped at its edges; a 100% wide area cannot move sideways. Saved offsets are retained if the viewport changes.</p><button type="button" onClick={()=>update({display:{...DEFAULT_DISPLAY}})}>Reset geometry</button><p className="control-muted">Reset fills the default values. Save applies them.</p><div className="control-preview-action"><button type="button" className="control-primary" onClick={()=>setPreview(true)}>Preview position</button><p className="control-muted">Preview uses this browser’s viewport. Check placement on the station before saving. Your draft stays unsaved until you choose Save settings.</p></div></section>}
      </fieldset>
      <div className="control-savebar"><span>{dirty?'Unsaved changes':fallback?'Device recovery settings':'Saved settings'} · revision {draft.revision}</span><button type="button" disabled={busy||!dirty} onClick={discard}>Discard draft</button><button type="button" className="control-primary" disabled={busy||!dirty||wrongDevice||invalidLabel||changedElsewhere||conflict} onClick={()=>void save()}>{busy?'Saving…':fallback?'Save on this browser only':'Save settings'}</button></div>
    </>}
    <dialog ref={confirmDialog} className="control-confirm" aria-labelledby="control-discard-title" onCancel={event=>{event.preventDefault();setPendingTarget(null);setPendingExit(false)}}><h2 id="control-discard-title">Discard unsaved changes?</h2><p>The current draft has not been saved.</p><button type="button" onClick={()=>{setPendingTarget(null);setPendingExit(false)}}>Keep editing</button><button type="button" className="control-primary" onClick={()=>{setDirty(false);setConflict(false);setError(null);if(pendingExit)exit();else if(pendingTarget!==null)setTarget(pendingTarget);setPendingExit(false);setPendingTarget(null)}}>Discard & {pendingExit?'exit':'switch'}</button></dialog>
  </div>
}
export {StationControl}
