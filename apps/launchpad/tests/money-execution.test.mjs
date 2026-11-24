import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {readMoneyExecution,moneyLineStatus,activeCodeLines} from '../src/moneyExecution.ts'
const run={transferId:'first',scenario:'human_in_the_loop',step:'approval_wait',status:'running',attempt:1,finalStatus:null,streamState:'live'}
test('progress requires the owned iframe, origin and valid payload',()=>{
 const owner={},origin='https://booth.example',event={source:owner,origin,data:{type:'booth:money-execution',...run}}
 assert.deepEqual(readMoneyExecution(event,origin,owner),run)
 assert.equal(readMoneyExecution({...event,source:{}},origin,owner),null)
 assert.equal(readMoneyExecution({...event,origin:'https://elsewhere.example'},origin,owner),null)
 for(const patch of [{step:'unknown'},{scenario:'unknown'},{attempt:-1},{finalStatus:'unknown'},{transferId:''},{streamState:'unknown'}])assert.equal(readMoneyExecution({...event,data:{...event.data,...patch}},origin,owner),null)
})
test('approval waits are distinct, while a new transfer clears the old highlight',()=>{
 assert.equal(moneyLineStatus(run),'waiting')
 assert.equal(moneyLineStatus({...run,status:'completed'}),'completed')
 assert.equal(moneyLineStatus({...run,transferId:'second',step:null,status:null}),undefined)
 assert.equal(moneyLineStatus({...run,transferId:null}),undefined)
})
test('native source excerpts highlight the matching await and call',()=>{
 const excerpts=JSON.parse(readFileSync(new URL('../src/moneyExcerpts.json',import.meta.url)))
 for(const profile of Object.values(excerpts))for(const [step,excerpt] of Object.entries(profile)){
  const lines=activeCodeLines(excerpt.code,step)
  assert.ok(lines.length>0,step)
  assert.match(excerpt.code.split('\n')[lines[0]],/await/)
 }
 assert.deepEqual(activeCodeLines('unrelated code','deposit'),[])
 assert.deepEqual(activeCodeLines('await example()',null),[])
})
const source=readFileSync(new URL('../public/booth/embed.js',import.meta.url),'utf8')
function links(origin){
 const location=new URL(origin),uiBase=new URL('/_temporal/primary/namespaces/booth/workflows',origin)
 return vm.runInNewContext(source.slice(source.indexOf('  function isTemporalLink'),source.indexOf('  function publishWorkflow'))+';({isTemporalLink,embeddedTemporalUrl})',{location,uiBase,URL})
}
test('standalone localhost links retain exact execution in the configured lower panel',()=>{
 const api=links('http://localhost:15111')
 for(const host of ['localhost:8233','localhost:15101','127.0.0.1:8233','localhost:15111']){
  const mapped=api.embeddedTemporalUrl(new URL(`http://${host}/namespaces/default/workflows/transfer-1/run-2/timeline?view=compact#event-3`))
  assert.equal(mapped,'http://localhost:15111/_temporal/primary/namespaces/booth/workflows/transfer-1/run-2/timeline?view=compact#event-3')
 }
 assert.equal(api.embeddedTemporalUrl(new URL('https://cloud.temporal.io/namespaces/cloud/workflows/transfer-1/run-2/timeline')),'http://localhost:15111/_temporal/primary/namespaces/booth/workflows/transfer-1/run-2/timeline')
 assert.equal(api.isTemporalLink(new URL('https://example.com/namespaces/default/workflows/a')),false)
 assert.equal(links('https://booth.example').isTemporalLink(new URL('http://localhost:8233/namespaces/default/workflows/a')),false)
 assert.equal(api.isTemporalLink(new URL('http://user:password@localhost:8233/namespaces/default/workflows/a')),false)
})
