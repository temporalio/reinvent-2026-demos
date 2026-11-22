import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createIdleMonitor,idleScreensaverEnabled} from '../src/useIdleScreensaver.ts'
class FakeDocument extends EventTarget {
  frames=[]
  querySelectorAll(){return this.frames}
}
function setup() {
  let time=0,tick=()=>{},expired=0,cancelled=0
  const countdown=[],doc=new FakeDocument()
  const stop=createIdleMonitor({rootDocument:doc,now:()=>time,schedule:callback=>{tick=callback;return ()=>cancelled++},onCountdown:value=>countdown.push(value),onTimeout:()=>expired++})
  return {doc,countdown,stop,at:value=>{time=value;tick()},expired:()=>expired,cancelled:()=>cancelled}
}
function input(doc,type,fields={}) {const event=new Event(type);Object.assign(event,fields);doc.dispatchEvent(event)}
test('30 seconds opens a five-second countdown; timeout occurs at 35, once',()=>{
  const x=setup();x.at(29_999);assert.deepEqual(x.countdown,[])
  x.at(30_000);assert.deepEqual(x.countdown,[5]);assert.equal(x.expired(),0)
  x.at(34_999);assert.equal(x.countdown.at(-1),1);assert.equal(x.expired(),0)
  x.at(35_000);x.at(36_000);assert.equal(x.expired(),1);assert.equal(x.cancelled(),1)
})
test('interaction during countdown resets the full idle window; mere hover does not',()=>{
  const x=setup();x.at(30_000);x.at(33_000);input(x.doc,'keydown');assert.equal(x.countdown.at(-1),null)
  x.at(62_999);assert.equal(x.expired(),0);assert.equal(x.countdown.at(-1),null)
  input(x.doc,'pointermove',{buttons:0,pointerType:'mouse'})
  x.at(63_000);assert.equal(x.countdown.at(-1),5)
  x.at(68_000);assert.equal(x.expired(),1)
})
test('nested app/Temporal iframe input resets idle; detached documents are cleaned up',()=>{
  const x=setup(),app=new FakeDocument(),nested=new FakeDocument(),temporal=new FakeDocument()
  app.frames=[{contentDocument:nested}];x.doc.frames=[{contentDocument:app},{contentDocument:temporal}]
  x.at(30_000);input(nested,'pointerdown',{pointerType:'pen'});assert.equal(x.countdown.at(-1),null)
  x.at(59_000);input(temporal,'wheel');x.at(88_000);assert.equal(x.countdown.at(-1),null)
  x.doc.frames=[];x.at(89_000);assert.equal(x.countdown.at(-1),5)
  input(nested,'input');x.at(94_000);assert.equal(x.expired(),1)
})
test('touch/pen drags reset idle; document changes and polling do not',()=>{
  const x=setup();x.at(29_000);input(x.doc,'pointermove',{buttons:1,pointerType:'pen'})
  x.at(58_000);input(x.doc,'pointermove',{buttons:0,pointerType:'touch'})
  x.at(87_000);input(x.doc,'load');x.at(88_000);assert.equal(x.countdown.at(-1),5)
  x.stop();input(x.doc,'touchstart');x.at(100_000);assert.equal(x.expired(),0)
})
test('only actually running Flight/Photo and staff configuration are exempt',()=>{
  assert.equal(idleScreensaverEnabled('screensaver',undefined,false,false),false)
  for(const id of ['flight-simulator','photo-booth']) {
    assert.equal(idleScreensaverEnabled('demo',id,true,false),false)
    assert.equal(idleScreensaverEnabled('demo',id,false,false),true)
    assert.equal(idleScreensaverEnabled('missions',id,false,false),true)
  }
  assert.equal(idleScreensaverEnabled('demo','tacos',true,false),true)
  assert.equal(idleScreensaverEnabled('crew',undefined,false,true),false)
  assert.equal(idleScreensaverEnabled('crew',undefined,false,false),true)
})
