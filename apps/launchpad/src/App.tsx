import { useEffect, useState } from 'react'
import { DemoStage } from './DemoStage'
import catalog from './catalog.json'
import logos from './customerLogos.json'
import './index.css'
import { useStationControl } from './stationControl'
import { DisplayArea } from './DisplayArea'
import { launchRestriction } from './stationPolicy'
import StationControl from './StationControl'

const initialDemo = catalog.find(d=>d.id===new URLSearchParams(window.location.search).get('demo')) || null

type Persona = 'Captain' | 'Mech' | 'Envoy' | 'Solarian'
export default function App() {
  const control = useStationControl()
  const [configurationOpen,setConfigurationOpen] = useState(false)
  const [admitted,setAdmitted] = useState<string | null>(null)
  const [screen, setScreen] = useState<'screensaver' | 'crew' | 'missions' | 'demo'>(initialDemo ? 'demo' : 'screensaver')
  const [persona, setPersona] = useState<Persona>('Captain')
  const [filter, setFilter] = useState<'all' | 'aws-ai' | 'holodeck'>('all')
  const [selected, setSelected] = useState<(typeof catalog)[number] | null>(initialDemo)
  const [runtime,setRuntime] = useState<{mode:string;availableDemos?:string[];temporalUi:string|null;notice?:string;demoNotices?:Record<string,string>}>({mode:'hosted',temporalUi:null})
  const [runtimeLoaded,setRuntimeLoaded] = useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/runtime-config.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(config=>{
      if(!config || !['local','hosted'].includes(config.mode) || (config.availableDemos!==undefined && (!Array.isArray(config.availableDemos) || !config.availableDemos.every((value:unknown)=>typeof value==='string'))))throw Error('Invalid station configuration')
      if(config.temporalUi){const url=new URL(config.temporalUi,window.location.origin); if(url.origin!==window.location.origin || !url.pathname.startsWith('/_temporal/'))throw Error('Invalid Temporal UI route')}
      setRuntime(config); setRuntimeLoaded(true)
    }).catch(error=>{if(error.name!=='AbortError'){setRuntime({mode:'hosted',availableDemos:[],temporalUi:null,notice:'Station settings could not be loaded. Reload before launching a demo.'});setRuntimeLoaded(true)}})
    return ()=>controller.abort()
  },[])
  useEffect(()=>{
    function navigateFromDemo(event:MessageEvent) {
      const frame=document.querySelector<HTMLIFrameElement>('.native-stage, .app-viewport iframe')
      if(event.origin!==window.location.origin || event.source!==frame?.contentWindow || event.data?.type!=='booth:navigate')return
      if(event.data.screen==='missions' || event.data.screen==='crew')setScreen(event.data.screen)
    }
    window.addEventListener('message',navigateFromDemo)
    return ()=>window.removeEventListener('message',navigateFromDemo)
  },[])
  function unavailable(demo: (typeof catalog)[number]): string | null {
    return launchRestriction(demo,runtime,control.effective,runtimeLoaded && control.ready)
  }
  // Admission is recorded once, so later policy changes never unmount an active demo.
  const blocked = selected ? unavailable(selected) : null
  useEffect(() => {
    if (screen !== 'demo') setAdmitted(null)
    else if (selected && !blocked) setAdmitted(selected.id)
  }, [screen, selected, blocked])
  const mayRun = selected && (admitted === selected.id || !blocked)
  const missions = catalog.filter(d => filter === 'holodeck' ? ['flight-simulator','photo-booth'].includes(d.id) : filter === 'aws-ai' ? ['loan','no-roads','agent-harness','agentic-sdlc'].includes(d.id) : !['flight-simulator','photo-booth'].includes(d.id))
  if (screen === 'screensaver') return <iframe className="attract" title="Temporal Crash Course interactive screensaver" src="/screensaver/index.html" onLoad={event => {
    const doc = event.currentTarget.contentDocument
    doc?.addEventListener('screensaver:next', () => setScreen('crew'), { once: true })
    // The embedded template emits an explicit event so planet taps stay interactive.
    doc?.addEventListener('reinvent:exit', () => setScreen('crew'), { once: true })
  }} />
  return <div className="launchpad">
    <LogoMarquee side="top" /><LogoMarquee side="bottom" />
    <header><img src="/assets/brand/temporal-logo.svg" alt="Temporal" /><button onClick={() => setScreen('screensaver')}>Screensaver</button></header>
    {runtime.notice && <aside className="local-notice">{runtime.notice}</aside>}
    <p className="station-status" role="status">{control.effective.label} · {control.effective.network_mode === 'offline' ? 'Offline policy' : 'Online policy'}{control.status !== 'online' ? ' · Hub unavailable; saved settings' : ''}</p>
    <DisplayArea display={control.effective.display}>
      {screen === 'crew' && <><p className="eyebrow">SECTOR 01 / CHOOSE YOUR CREW</p><h1>CREW</h1><div className="crew">{(['Captain','Mech','Envoy','Solarian'] as Persona[]).map((name,i) => <button data-persona={name.toLowerCase()} key={name} onClick={() => {setPersona(name);setFilter('all');setScreen('missions')}}><span>0{i+1}</span><strong>{name}</strong><p>{['Business outcomes and durable customer experiences','Workflow code and application architecture','Operations, reliability, and recovery','Creative, content, and growth workflows'][i]}</p></button>)}<button onClick={() => {setFilter('aws-ai');setScreen('missions')}}><strong>Space Wizard</strong><p>AWS and AI missions</p></button><button onClick={() => {setFilter('holodeck');setScreen('missions')}}><strong>Holodeck</strong><p>Flight simulator and AI Photo Booth</p></button></div></>}
      {screen === 'missions' && <><p className="eyebrow">SECTOR 02 / {filter === 'all' ? persona : filter === 'holodeck' ? 'HOLODECK' : 'SPACE WIZARD'}</p><h1>MISSION</h1><div className="missions">{missions.map(d => <article key={d.id}><h2>{d.title}</h2><p>{d.internet === 'required' ? 'Internet required' : d.internet === 'conditional' ? 'Some features require internet' : 'Cloud deployment requires internet'}</p>{runtime.demoNotices?.[d.id] && <p className="pending">{runtime.demoNotices[d.id]}</p>}{d.tentative && runtime.mode!=='local' && <p className="pending">Requires booth GitHub setup</p>}{unavailable(d) && <p className="pending">{unavailable(d)}</p>}<button disabled={!!unavailable(d)} onClick={() => {setAdmitted(d.id);setSelected(d);setScreen('demo')}}>Launch ↗</button></article>)}</div></>}
      {screen === 'demo' && selected && <><p className="eyebrow">SECTOR 03 / {persona}</p><h1 className="demo-title">{selected.title}</h1>{!mayRun ? <p role="status">{blocked || 'Choose another mission.'}</p> : <>{runtime.demoNotices?.[selected.id] && <p className="preview-notice" role="status">{runtime.demoNotices[selected.id]}</p>}<DemoStage key={`${selected.id}-${persona}`} demo={selected} persona={persona} temporalUi={runtime.temporalUi} /></>}</>}
    </DisplayArea>
    <footer><button onClick={() => setScreen('crew')}>Crew</button><button onClick={() => setScreen('missions')}>Missions</button><button className="ziggy-settings" onClick={()=>setConfigurationOpen(true)} aria-label="Open station configuration"><img src="/assets/brand/ziggy-face.png" alt="Ziggy station settings" /></button></footer>
    {configurationOpen && <div className="station-settings-overlay" role="dialog" aria-modal="true" aria-label="Station configuration"><StationControl onExit={()=>setConfigurationOpen(false)} /></div>}
  </div>
}

function LogoMarquee({ side }: {side: 'top' | 'bottom'}) {
  return <div className={`customer-marquee ${side}`} aria-hidden="true"><div className="logo-track">{[0,1].map(copy => <div className="logo-group" key={copy}>{logos.map(name => <img key={name} src={`/assets/brand/customer-logos/${name}`} alt="" />)}</div>)}</div></div>
}
