import { useEffect, useState, type CSSProperties } from 'react'
import { DemoStage } from './DemoStage'
import catalog from './catalog.json'
import './index.css'
import './missionArtwork.css'
import { useStationControl } from './stationControl'
import { DisplayArea } from './DisplayArea'
import { launchRestriction } from './stationPolicy'
import StationControl from './StationControlPanel'
import { initialLaunchScreen } from './launchNavigation'
import { missionMetadata } from './missionMetadata'
import { LogoMarquee } from './LogoMarquee'
import { CrewPicker, type Persona } from './CrewPicker'
import { BoothBackground } from './BoothBackground'
import { idleDelayForScreen, idleNavigationTarget, useIdleScreensaver } from './useIdleScreensaver'

const initialDemo = catalog.find(d=>d.id===new URLSearchParams(window.location.search).get('demo')) || null

export default function App() {
  const control = useStationControl()
  const [configurationOpen,setConfigurationOpen] = useState(false)
  const [admitted,setAdmitted] = useState<string | null>(null)
  const [screen, setScreen] = useState<'screensaver' | 'crew' | 'missions' | 'demo'>(initialLaunchScreen(window.location.search,!!initialDemo))
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
  function showCrew() {
    setSelected(null);setAdmitted(null);setFilter('all');setPersona('Captain');setScreen('crew')
  }
  function showScreensaver() {
    setSelected(null);setAdmitted(null);setScreen('screensaver')
    const url=new URL(window.location.href)
    url.searchParams.delete('demo');url.searchParams.delete('screen')
    window.history.replaceState(null,'',url)
  }
  function showMissions() {
    setSelected(null);setAdmitted(null);setScreen('missions')
    const url=new URL(window.location.href)
    url.searchParams.delete('demo')
    window.history.replaceState(null,'',url)
  }
  const idleTarget=idleNavigationTarget(screen,selected?.id,!!mayRun,configurationOpen,filter)
  const idleCountdown=useIdleScreensaver({enabled:idleTarget!==null,onTimeout:idleTarget==='missions'?showMissions:showScreensaver,idleMs:idleDelayForScreen(screen),countdownMs:5_000,scope:`${screen}:${filter}:${selected?.id || ''}`})
  if (screen === 'screensaver') return <iframe className="attract" title="Temporal Crash Course interactive screensaver" src="/screensaver/index.html" onLoad={event => {
    const doc = event.currentTarget.contentDocument
    doc?.addEventListener('screensaver:next', showCrew, { once: true })
    // The embedded template emits an explicit event so planet taps stay interactive.
    doc?.addEventListener('reinvent:exit', showCrew, { once: true })
  }} />
  return <div className={`launchpad${screen === 'crew' ? ' launchpad-crew' : ''}`}>
    <BoothBackground />
    <LogoMarquee side="top" /><LogoMarquee side="bottom" />
    <header><img src="/assets/brand/temporal-logo.svg" alt="Temporal" />{screen === 'demo' && selected && <h1 className="demo-title">{selected.title}</h1>}</header>
    <DisplayArea display={control.effective.display} mode={screen === 'demo' ? 'demo' : screen === 'crew' ? 'crew' : 'missions'}>
      {screen === 'crew' && <><p className="eyebrow">SECTOR 01 / CHOOSE YOUR CREW</p><h1>CREW</h1><CrewPicker onPersona={name => {setPersona(name);setFilter('all');setScreen('missions')}} onWizard={() => {setFilter('aws-ai');setScreen('missions')}} onHolodeck={() => {setFilter('holodeck');setScreen('missions')}} /></>}
      {screen === 'missions' && <><p className="eyebrow">SECTOR 02 / {filter === 'all' ? persona : filter === 'holodeck' ? 'HOLODECK' : 'SPACE WIZARD'}</p><h1>MISSION</h1><div className={`missions${filter==='holodeck'?' missions-holodeck':filter==='aws-ai'?' missions-aws-ai':' missions-main'}`} style={{'--mission-rows':Math.ceil(missions.length/2),'--mission-wide-columns':Math.min(4,missions.length),'--mission-wide-rows':Math.ceil(missions.length/4)} as CSSProperties}>{missions.map(d => {
        const metadata=missionMetadata[d.id]
        const restriction=unavailable(d)
        return <article key={d.id} className="mission-card" aria-disabled={!!restriction}>
          <div className="mission-card-heading"><span className="mission-icon"><img src={`/assets/brand/icons/${metadata.icon}.svg`} alt="" /></span><h2>{metadata.title}</h2></div>
          <p className="mission-description">{metadata.description}</p>
          {filter!=='all' && metadata.previewImage && <div className="mission-preview"><img src={metadata.previewImage} alt={metadata.previewAlt} /></div>}
          <ul className="mission-tags" aria-label={`${metadata.title} capabilities`}>{metadata.tags.map(tag=><li key={tag}>{tag}</li>)}</ul>
          {d.tentative && runtime.mode!=='local' && <p className="pending">Requires booth GitHub setup</p>}
          {restriction && <p className="pending">{restriction}</p>}
          <button disabled={!!restriction} aria-label={`Launch ${metadata.title}`} onClick={() => {setAdmitted(d.id);setSelected(d);setScreen('demo')}}><span>Launch</span><span aria-hidden="true">↗</span></button>
        </article>
      })}</div></>}
      {screen === 'demo' && selected && <>{!mayRun ? <p role="status">{blocked || 'Choose another mission.'}</p> : <><DemoStage key={`${selected.id}-${persona}`} demo={selected} persona={persona} temporalUi={runtime.temporalUi} /></>}</>}
    </DisplayArea>
    <footer><button onClick={showCrew}>Crew</button><button onClick={showMissions}>Missions</button><div className="screensaver-control"><span className="idle-countdown" role="status" aria-live="polite">{idleCountdown !== null ? `${idleTarget==='missions'?'Missions':'Screensaver'} in ${idleCountdown}s` : ''}</span><button onClick={showScreensaver}>Screensaver</button></div><button className="ziggy-settings" onClick={()=>setConfigurationOpen(true)} aria-label="Open station configuration"><img src="/assets/frame/ziggy-astronaut.png" alt="Ziggy station settings" /></button></footer>
    {configurationOpen && <div className="station-settings-overlay" role="dialog" aria-modal="true" aria-label="Station configuration"><StationControl onExit={()=>setConfigurationOpen(false)} /></div>}
  </div>
}
