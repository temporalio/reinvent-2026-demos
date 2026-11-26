import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {liveExcerpt as reportedExcerpt} from './demoExecution'
import type {LiveCursor} from './workflowHistory'
import moneyExcerpts from './moneyExcerpts.json'
import { activeCodeLines, moneyLineStatus, moneyStepLabels, type MoneyExecution } from './moneyExecution'
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
export function CodeSamples({demoId,execution,phase,money,cursor}:{demoId:string;execution?:TacoExecution|null;phase?:TacoPhase;money?:MoneyExecution|null;cursor?:LiveCursor|null}) {
  const [catalog,setCatalog] = useState<ExampleCatalog|null>(null)
  const [selected,setSelected] = useState<SdkId|null>(null)
  const [failed,setFailed] = useState(false)
  const demo=catalog?.demos[demoId]
  const sdk=selected || demo?.nativeLanguage
  const excerptKey=execution && phase===tacoPhase(execution) && execution.step && Object.hasOwn(tacoExcerpts,execution.step)?execution.step as keyof typeof tacoExcerpts:phase || 'order'
  const liveExcerpt=demoId==='tacos' && execution?.mode==='temporal' && execution.language==='python' && sdk==='python'?tacoExcerpts[excerptKey]:null
  const profile=money?.scenario==='happy_path'?moneyExcerpts.simple:moneyExcerpts.scenario
  const moneyExcerpt=demoId==='money-transfer' && sdk==='python'?profile[(money?.step || 'validate') as keyof typeof profile]:null
  const trackedExcerpt=sdk===demo?.nativeLanguage?reportedExcerpt(demoId,cursor):undefined
  const code=trackedExcerpt?.code || moneyExcerpt?.code || liveExcerpt?.code || (sdk ? demo?.examples[sdk]?.code : undefined)
  const tacoLive=!!liveExcerpt && !!execution?.orderId && phase===tacoPhase(execution)
  const moneyLive=!!moneyExcerpt && !!money?.transferId
  const activeStep=moneyLive?money?.step:tacoLive?execution?.step:null
  const lineStatus=trackedExcerpt?cursor?.status:moneyLive?moneyLineStatus(money):tacoLive?execution?.status:undefined
  const activeLines=useMemo(()=>trackedExcerpt?trackedExcerpt.focus:activeStep && code?activeCodeLines(code,activeStep):[],[code,activeStep,trackedExcerpt])
  const preRef=useRef<HTMLPreElement>(null)
  useLayoutEffect(()=>{
    const pre=preRef.current
    if(!pre)return
    const focus=()=>{
      const row=pre.querySelector<HTMLElement>('[data-current-step]')
      pre.scrollTop=row?Math.max(0,row.offsetTop-pre.clientHeight*.35):0
    }
    focus()
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(focus)
    observer?.observe(pre)
    return ()=>observer?.disconnect()
  },[code,activeStep,money?.transferId,execution?.orderId,cursor?.runId])
  const lines=useMemo(()=>sdk && code!==undefined ? highlight(code,sdk) : [],[code,sdk])
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/booth/code-examples.json',{signal:controller.signal,cache:'no-cache'})
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
    <p className="code-source"><strong>{demo.concept}</strong> · Running demo: {native?.label || demo.nativeLanguage}</p>
    <p className="code-note" role="status">{trackedExcerpt?`${cursor?.stale?'Updates interrupted. Last recorded step':'Recorded step'}: ${trackedExcerpt.label} · ${cursor?.status}.`:moneyLive?`${money?.streamState==='stale'?'Updates interrupted. Last reported step':'Reported step'}: ${moneyStepLabels[money?.step || ''] || 'Starting transfer'} · ${lineStatus || 'pending'}.`:moneyExcerpt?'Start a transfer to follow its Python workflow.':liveExcerpt?'Python worker · excerpt for this phase.':`${language?.label}: ${example.note}`}</p>
    <pre ref={preRef} data-testid="workflow-code" tabIndex={0} aria-label={`${language?.label} workflow example`}><code className={`language-${language?.language}`}>{lines.map((tokens,index)=><Fragment key={index}>{index>0 && '\n'}<span className="code-line" data-current-step={activeLines.includes(index)?'true':undefined} data-status={activeLines.includes(index)?lineStatus:undefined}>{tokens.length?tokens.map((token,position)=>token.k==='plain' ? token.t : <span key={position} className={`tok-${token.k}`}>{token.t}</span>):' '}</span></Fragment>)}</code></pre>
  </div>
}
