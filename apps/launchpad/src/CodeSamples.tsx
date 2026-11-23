import { Fragment, useEffect, useMemo, useState } from 'react'
import tacoExcerpts from './tacoExcerpts.json'
import { tacoPhase, type TacoExecution, type TacoPhase } from './tacoExecution'
import { SDK_LOGOS } from './ship-ui/components/SdkLogos'
import { SDK_INFO, tokenize, type SdkId, type Tok } from './ship-ui/lib/code'

type Language = {id:SdkId;label:string;icon:string;language:string}
type Example = {code:string;note:string}
type DemoExamples = {concept:string;summary:string;nativeLanguage:SdkId;source:{path:string;symbol:string};examples:Record<SdkId,Example>}
type ExampleCatalog = {languages:Language[];demos:Record<string,DemoExamples>}

/** Token lines for one example, using the same per-SDK tokenizer as the ship UI's code viewer. */
function highlight(code:string, sdk:SdkId):Tok[][] {
  let inDocstring=false
  return code.split('\n').map(line=>{
    const [tokens,next]=tokenize(line,SDK_INFO[sdk].syntax,inDocstring)
    inDocstring=next
    return tokens
  })
}

/** Curated equivalents explain orchestration; changing SDK never changes the running app. */
export function CodeSamples({demoId,execution,phase}:{demoId:string;execution?:TacoExecution|null;phase?:TacoPhase}) {
  const [catalog,setCatalog] = useState<ExampleCatalog|null>(null)
  const [selected,setSelected] = useState<SdkId|null>(null)
  const [failed,setFailed] = useState(false)
  const demo=catalog?.demos[demoId]
  const sdk=selected || demo?.nativeLanguage
  const excerptKey=execution && phase===tacoPhase(execution) && execution.step && Object.hasOwn(tacoExcerpts,execution.step)?execution.step as keyof typeof tacoExcerpts:phase || 'order'
  const liveExcerpt=demoId==='tacos' && execution?.mode==='temporal' && execution.language==='python' && sdk==='python'?tacoExcerpts[excerptKey]:null
  const code=liveExcerpt?.code || (sdk ? demo?.examples[sdk]?.code : undefined)
  const lines=useMemo(()=>sdk && code!==undefined ? highlight(code,sdk) : [],[code,sdk])
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/booth/code-examples.json',{signal:controller.signal})
      .then(response=>{if(!response.ok)throw Error('Code unavailable');return response.json()})
      .then(setCatalog)
      .catch(error=>{if(error.name!=='AbortError')setFailed(true)})
    return ()=>controller.abort()
  },[])
  if(!catalog || !demo || !sdk)return <p role="status">{failed || catalog?'Code examples are unavailable for this demo. Reload to try again.':'Loading workflow examples…'}</p>
  const language=catalog.languages.find(item=>item.id===sdk)
  const native=catalog.languages.find(item=>item.id===demo.nativeLanguage)
  const example=demo.examples[sdk]
  return <div className="code-examples">
    <div className="sdk-selector" role="group" aria-label="Example language">{catalog.languages.filter(item=>Object.hasOwn(SDK_LOGOS,item.id)).map(item=>{
      const Logo=SDK_LOGOS[item.id]
      return <button key={item.id} data-sdk={item.id} type="button" aria-label={`Show ${item.label} example`} title={item.label} aria-pressed={sdk===item.id} onClick={()=>setSelected(item.id)}><span className="sdk-logo"><Logo /></span><span>{item.label}</span></button>
    })}</div>
    <p className="code-source"><strong>{demo.concept}</strong> · Running demo: {native?.label || demo.nativeLanguage}<br />{demo.source.path} · {demo.source.symbol}{liveExcerpt?` · lines ${liveExcerpt.startLine}–${liveExcerpt.endLine}`:''}</p>
    <p className="code-note" role="status">{liveExcerpt?'Python worker · excerpt for this phase.':`${language?.label}: ${example.note}`}</p>
    <pre data-testid="workflow-code" tabIndex={0} aria-label={`${language?.label} workflow example`}><code className={`language-${language?.language}`}>{lines.map((tokens,index)=><Fragment key={index}>{index>0 && '\n'}{tokens.map((token,position)=>token.k==='plain' ? token.t : <span key={position} className={`tok-${token.k}`}>{token.t}</span>)}</Fragment>)}</code></pre>
  </div>
}
