import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
const context={};runInNewContext(readFileSync(new URL('../public/screensaver/preview-rotation.js',import.meta.url),'utf8'),context)
function setup(count=9){
 let now=0,id=0;const jobs=new Map(),selected=[];
 const rotation=context.createPreviewRotation({count,onSelect:index=>selected.push(index),schedule:(fn,delay)=>{jobs.set(++id,{fn,at:now+delay});return id},cancel:key=>jobs.delete(key)});
 return {rotation,selected,pending:()=>jobs.size,advance(ms){now+=ms;for(const [key,job] of [...jobs])if(job.at<=now){jobs.delete(key);job.fn()}}};
}
test('closed preview waits five seconds and selects a different planet, wrapping after the last',()=>{
 const x=setup();x.rotation.selected(8);x.rotation.closed();x.advance(4999);assert.deepEqual(x.selected,[]);x.advance(1);assert.deepEqual(x.selected,[0]);assert.equal(x.pending(),0);
})
test('manual selection cancels the pending preview until that card closes',()=>{
 const x=setup();x.rotation.selected(0);x.rotation.closed();x.advance(3000);x.rotation.selected(4);x.advance(10000);assert.deepEqual(x.selected,[]);x.rotation.closed();x.advance(5000);assert.deepEqual(x.selected,[5]);
})
test('background tabs pause selection and resume with a full five-second wait',()=>{
 const x=setup();x.rotation.selected(1);x.rotation.closed();x.advance(1000);x.rotation.setHidden(true);x.advance(10000);assert.deepEqual(x.selected,[]);x.rotation.setHidden(false);x.advance(4999);assert.deepEqual(x.selected,[]);x.advance(1);assert.deepEqual(x.selected,[2]);
})
test('repeated close does not duplicate timers; page exit stops rotation',()=>{
 const x=setup();x.rotation.selected(0);x.rotation.closed();x.rotation.closed();assert.equal(x.pending(),1);x.rotation.stop();x.advance(10000);assert.deepEqual(x.selected,[]);x.rotation.closed();assert.equal(x.pending(),0);
})
test('a list without a different planet never starts a preview loop',()=>{
 for(const count of [0,1]){const x=setup(count);x.rotation.closed();x.advance(5000);assert.deepEqual(x.selected,[]);assert.equal(x.pending(),0);}
})
