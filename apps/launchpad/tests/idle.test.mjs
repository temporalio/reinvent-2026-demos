import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createIdleMonitor,idleScreensaverEnabled,idleNavigationTarget,idleDelayForScreen} from '../src/useIdleScreensaver.ts'
class FakeDocument extends EventTarget {
  frames=[]
  querySelectorAll(){return this.frames}
}
function setup(options={}) {
  let time=0,tick=()=>{},expired=0,cancelled=0
  const countdown=[],doc=new FakeDocument()
  const stop=createIdleMonitor({rootDocument:doc,idleMs:30_000,now:()=>time,schedule:callback=>{tick=callback;return ()=>cancelled++},onCountdown:value=>countdown.push(value),onTimeout:()=>expired++,...options})
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

test('all timed screens expire at sixty seconds including the five-second warning',()=>{
  for(const screen of ['crew','missions','demo']) {
    const x=setup({idleMs:idleDelayForScreen(screen),countdownMs:5_000});x.at(54_999);assert.deepEqual(x.countdown,[])
    x.at(55_000);assert.equal(x.countdown.at(-1),5);x.at(59_999);assert.equal(x.expired(),0)
    x.at(60_000);assert.equal(x.expired(),1)
  }
})
test('idle navigation advances demo to missions, then missions to the screensaver',()=>{
  assert.equal(idleNavigationTarget('demo','tacos',true,false),'missions')
  assert.equal(idleNavigationTarget('missions',undefined,false,false),'screensaver')
  assert.equal(idleNavigationTarget('missions',undefined,false,false,'aws-ai'),'screensaver')
  assert.equal(idleNavigationTarget('crew',undefined,false,false),'screensaver')
  assert.equal(idleNavigationTarget('screensaver',undefined,false,false),null)
})
test('Holodeck picker and running fun demos never time out; staff controls remain exempt',()=>{
  assert.equal(idleNavigationTarget('missions',undefined,false,false,'holodeck'),null)
  for(const id of ['flight-simulator','photo-booth'])assert.equal(idleNavigationTarget('demo',id,true,false,'holodeck'),null)
  for(const screen of ['crew','missions','demo'])assert.equal(idleNavigationTarget(screen,'tacos',true,true),null)
})
test('a nested tap restarts the complete sixty-second demo interval',()=>{
  const x=setup({idleMs:idleDelayForScreen('demo')}),app=new FakeDocument();x.doc.frames=[{contentDocument:app}]
  x.at(59_000);input(app,'pointerdown',{pointerType:'touch'});assert.equal(x.countdown.at(-1),null)
  x.at(118_999);assert.equal(x.expired(),0);x.at(119_000);assert.equal(x.expired(),1)
})

test('mission picker waits 60 seconds total and a tap resets its complete window',()=>{
  const x=setup({idleMs:idleDelayForScreen('missions'),countdownMs:5000});
  x.at(54_999);assert.equal(x.countdown.at(-1),undefined);
  x.at(55_000);assert.equal(x.countdown.at(-1),5);
  input(x.doc,'pointerdown');x.at(109_999);assert.equal(x.expired(),0);
  x.at(110_000);assert.equal(x.countdown.at(-1),5);
  x.at(114_999);assert.equal(x.expired(),0);x.at(115_000);assert.equal(x.expired(),1);
  for(const screen of ['demo','missions','crew'])assert.equal(idleDelayForScreen(screen)+5000,60_000);
});
