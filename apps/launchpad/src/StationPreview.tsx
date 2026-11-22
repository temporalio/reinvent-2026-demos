import {useEffect,useState} from 'react'
import catalog from './catalog.json'
import {DemoStage} from './DemoStage'
import {DisplayArea} from './DisplayArea'
import {LogoMarquee} from './LogoMarquee'
import type {DisplaySettings} from './stationControl'

type PreviewRuntime={temporalUi:string|null;unavailable:boolean;notice?:string}
const tacos=catalog.find(demo=>demo.id==='tacos')!

/** A local rendering of the unsaved draft. This view never sends control API writes. */
export function StationPreview({display,label,onBack}:{display:DisplaySettings;label:string;onBack:()=>void}) {
  const [runtime,setRuntime]=useState<PreviewRuntime|null>(null)
  const [attract,setAttract]=useState(false)
  const [failed,setFailed]=useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/runtime-config.json',{signal:controller.signal}).then(response=>{
      if(!response.ok)throw Error('Runtime unavailable')
      return response.json()
    }).then(config=>{
      if(!config || !['local','hosted'].includes(config.mode))throw Error('Invalid runtime')
      let temporalUi:string|null=null
      if(config.temporalUi){const url=new URL(config.temporalUi,window.location.origin);if(url.origin!==window.location.origin||!url.pathname.startsWith('/_temporal/'))throw Error('Invalid Temporal route');temporalUi=url.href}
      const unavailable=config.availableDemos!==undefined && (!Array.isArray(config.availableDemos)||!config.availableDemos.includes('tacos'))
      setRuntime({temporalUi,unavailable,notice:config.demoNotices?.tacos})
    }).catch(error=>{if(error.name!=='AbortError')setFailed(true)})
    return ()=>controller.abort()
  },[])
  const navigation=<footer className="preview-footer"><span className="preview-caption">{label} · unsaved position preview</span><div className="preview-footer-actions"><button type="button" aria-label="Back to station controls" title="Back to station controls" onClick={onBack}>←</button><button type="button" onClick={()=>setAttract(true)}>Screensaver</button><button type="button" className="ziggy-settings" aria-label="Return to station controls" onClick={onBack}><img src="/assets/brand/ziggy-face.png" alt="" /></button></div></footer>
  if(attract)return <div className="station-preview station-preview-attract"><iframe className="attract" title="Screensaver staff preview" src="/screensaver/index.html" onLoad={event=>{
    event.currentTarget.contentDocument?.addEventListener('reinvent:exit',onBack,{once:true})
  }} />{navigation}</div>
  return <div className="launchpad station-preview" aria-label={`${label} position preview`}>
    <LogoMarquee side="top"/><LogoMarquee side="bottom"/>
    <header><img src="/assets/brand/temporal-logo.svg" alt="Temporal"/><h1 className="demo-title">{tacos.title}</h1></header>
    <DisplayArea display={display} mode="demo">
      {failed?<p className="preview-unavailable" role="alert">Runtime settings could not be loaded. Return to controls and try the preview again.</p>:!runtime?<p className="preview-unavailable" role="status">Loading Tacos preview…</p>:runtime.unavailable?<p className="preview-unavailable" role="status">Tacos is not running in this environment. Start the demo before previewing its position.</p>:<DemoStage demo={tacos} persona="Captain" temporalUi={runtime.temporalUi} notice={runtime.notice}/>}
    </DisplayArea>
    {navigation}
  </div>
}
