import { useEffect, useState } from 'react'
import { SDK_LOGOS } from './ship-ui/components/SdkLogos'
import type { SdkId } from './ship-ui/lib/code'

type Language = {id:SdkId;label:string;icon:string;language:string}
type Example = {code:string;note:string}
type DemoExamples = {concept:string;summary:string;nativeLanguage:SdkId;source:{path:string;symbol:string};examples:Record<SdkId,Example>}
type ExampleCatalog = {languages:Language[];demos:Record<string,DemoExamples>}

/** Curated equivalents explain orchestration; changing SDK never changes the running app. */
export function CodeSamples({demoId}:{demoId:string}) {
  const [catalog,setCatalog] = useState<ExampleCatalog|null>(null)
  const [selected,setSelected] = useState<SdkId|null>(null)
  const [failed,setFailed] = useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/booth/code-examples.json',{signal:controller.signal})
      .then(response=>{if(!response.ok)throw Error('Code unavailable');return response.json()})
      .then(setCatalog)
      .catch(error=>{if(error.name!=='AbortError')setFailed(true)})
    return ()=>controller.abort()
  },[])
  const demo=catalog?.demos[demoId]
  if(!catalog || !demo)return <p role="status">{failed || catalog?'Code examples are unavailable for this demo. Reload to try again.':'Loading workflow examples…'}</p>
  const sdk=selected || demo.nativeLanguage
  const language=catalog.languages.find(item=>item.id===sdk)
  const native=catalog.languages.find(item=>item.id===demo.nativeLanguage)
  const example=demo.examples[sdk]
  return <div className="code-examples">
    <div className="sdk-selector" role="group" aria-label="Example language">{catalog.languages.filter(item=>Object.hasOwn(SDK_LOGOS,item.id)).map(item=>{
      const Logo=SDK_LOGOS[item.id]
      return <button key={item.id} data-sdk={item.id} type="button" aria-label={`Show ${item.label} example`} title={item.label} aria-pressed={sdk===item.id} onClick={()=>setSelected(item.id)}><span className="sdk-logo"><Logo /></span><span>{item.label}</span></button>
    })}</div>
    <p className="code-source"><strong>{demo.concept}</strong> · Running demo: {native?.label || demo.nativeLanguage}<br />{demo.source.path} · {demo.source.symbol}</p>
    <p className="code-note" role="status">{language?.label}: {example.note}</p>
    <pre data-testid="workflow-code" tabIndex={0} aria-label={`${language?.label} workflow example`}><code className={`language-${language?.language}`}>{example.code}</code></pre>
  </div>
}
