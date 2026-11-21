import { useState } from 'react'
import catalog from './catalog.json'
import logos from './customerLogos.json'
import './index.css'

type Persona = 'Captain' | 'Mech' | 'Envoy' | 'Solarian'
export default function App() {
  const [screen, setScreen] = useState<'screensaver' | 'crew' | 'missions' | 'demo'>('screensaver')
  const [persona, setPersona] = useState<Persona>('Captain')
  const [filter, setFilter] = useState<'all' | 'aws-ai' | 'holodeck'>('all')
  const [selected, setSelected] = useState<(typeof catalog)[number] | null>(null)
  const [compact, setCompact] = useState(false)
  const [lower, setLower] = useState(false)
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
    <main className={`${compact ? 'compact' : ''} ${lower ? 'lower' : ''}`}>
      {screen === 'crew' && <><p className="eyebrow">SECTOR 01 / CHOOSE YOUR CREW</p><h1>CREW</h1><div className="crew">{(['Captain','Mech','Envoy','Solarian'] as Persona[]).map((name,i) => <button data-persona={name.toLowerCase()} key={name} onClick={() => {setPersona(name);setFilter('all');setScreen('missions')}}><span>0{i+1}</span><strong>{name}</strong><p>{['Business outcomes and durable customer experiences','Workflow code and application architecture','Operations, reliability, and recovery','Creative, content, and growth workflows'][i]}</p></button>)}<button onClick={() => {setFilter('aws-ai');setScreen('missions')}}><strong>Space Wizard</strong><p>AWS and AI missions</p></button><button onClick={() => {setFilter('holodeck');setScreen('missions')}}><strong>Holodeck</strong><p>Flight simulator and AI Photo Booth</p></button></div></>}
      {screen === 'missions' && <><p className="eyebrow">SECTOR 02 / {filter === 'all' ? persona : filter === 'holodeck' ? 'HOLODECK' : 'SPACE WIZARD'}</p><h1>MISSION</h1><div className="missions">{missions.map(d => <article key={d.id}><h2>{d.title}</h2><p>{d.internet === 'required' ? 'Internet required' : d.internet === 'conditional' ? 'Some features require internet' : 'Cloud deployment requires internet'}</p>{d.tentative && <p className="pending">Requires booth GitHub setup</p>}<button disabled={d.tentative} onClick={() => {setSelected(d);setScreen('demo')}}>Launch ↗</button></article>)}</div></>}
      {screen === 'demo' && selected && <><p className="eyebrow">SECTOR 03 / {persona}</p><h1 className="demo-title">{selected.title}</h1><iframe title={selected.title} className="demo-frame" src={`${selected.path}?persona=${persona.toLowerCase()}`} allow="camera; fullscreen" /></>}
    </main>
    <footer><button onClick={() => setScreen('crew')}>Crew</button><button onClick={() => setScreen('missions')}>Missions</button><details><summary><img src="/assets/brand/ziggy-face.png" alt="Station display settings" /></summary><div><p>Display preview controls</p><button aria-pressed={compact} onClick={() => setCompact(!compact)}>Smaller demo area</button><button aria-pressed={lower} onClick={() => setLower(!lower)}>Lower demo area</button><p>PIN protection and fleet configuration are not connected yet.</p></div></details></footer>
  </div>
}

function LogoMarquee({ side }: {side: 'top' | 'bottom'}) {
  return <div className={`customer-marquee ${side}`} aria-hidden="true"><div className="logo-track">{[0,1].map(copy => <div className="logo-group" key={copy}>{logos.map(name => <img key={name} src={`/assets/brand/customer-logos/${name}`} alt="" />)}</div>)}</div></div>
}
