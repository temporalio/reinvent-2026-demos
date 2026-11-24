import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=readFileSync(new URL('../src/temporalFrame.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText

test('loaded workflow frames receive one booth keyboard without replacing their document',()=>{
 const exports={},children=[]
 const doc={readyState:'complete',location:{href:'http://booth/_temporal/primary/namespaces/default/workflows'},getElementById:id=>children.find(node=>node.id===id),createElement:tag=>({tag}),head:{append:(...nodes)=>children.push(...nodes)}}
 vm.runInNewContext(code,{exports})
 const frame={contentDocument:doc}
 exports.styleTemporalFrame(frame);exports.styleTemporalFrame(frame)
 assert.equal(children.length,3)
 assert.equal(children.find(node=>node.tag==='script').src,'/booth/touch-keyboard.js')
 assert.equal(children.find(node=>node.tag==='link').href,'/booth/keyboard.css')
 assert.equal(frame.contentDocument,doc)
})

test('cross-origin or not-yet-loaded documents receive no injection',()=>{
 const exports={};vm.runInNewContext(code,{exports})
 assert.doesNotThrow(()=>exports.styleTemporalFrame({get contentDocument(){throw Error('cross origin')}}))
 assert.doesNotThrow(()=>exports.styleTemporalFrame({contentDocument:{readyState:'loading'}}))
})
