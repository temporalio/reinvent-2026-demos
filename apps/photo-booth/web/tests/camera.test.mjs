import {test,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {openCamera} from '../src/photobooth/camera.ts'
const originals=new Map()
function replace(key,value){if(!originals.has(key))originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value,writable:true})}
afterEach(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}originals.clear()})
function setup({search='',error,playError}={}){
 let requested,stopped=0,cancelled=0,calls=0
 const track={stop:()=>stopped++,getSettings:()=>({deviceId:'camera-2'})}
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]}
 const context=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{}})
 replace('location',{search})
 replace('navigator',{mediaDevices:{getUserMedia:async constraints=>{requested=constraints;calls++;if(error)throw error;return stream}}})
 replace('document',{createElement:tag=>tag==='video'?{play:async()=>{if(playError)throw playError},videoWidth:1920,videoHeight:1080}:{getContext:()=>context,toDataURL:()=> 'data:image/jpeg;base64,sample'}})
 replace('requestAnimationFrame',()=>42);replace('cancelAnimationFrame',id=>{assert.equal(id,42);cancelled++})
 return {requested:()=>requested,stopped:()=>stopped,cancelled:()=>cancelled,calls:()=>calls}
}
test('default camera requests video only and releases its tracks',async()=>{const x=setup(),camera=await openCamera();assert.equal(camera.live,true);assert.equal(x.requested().audio,false);assert.equal(x.requested().video.facingMode,'user');assert.equal(camera.deviceId,'camera-2');camera.stop();assert.equal(x.stopped(),1)})
test('selected camera is requested by exact device ID',async()=>{const x=setup();await openCamera('usb-camera');assert.deepEqual(x.requested().video.deviceId,{exact:'usb-camera'});assert.equal(x.requested().video.facingMode,undefined)})
test('denied permission supplies an actionable retry message',async()=>{setup({error:new DOMException('denied','NotAllowedError')});const camera=await openCamera();assert.equal(camera.live,false);assert.match(camera.error,/Allow Camera/);camera.stop()})
test('busy cameras provide a different error',async()=>{setup({error:new DOMException('busy','NotReadableError')});assert.match((await openCamera()).error,/busy/)})
test('video playback failure releases the acquired camera',async()=>{const x=setup({playError:new Error('play failed')});assert.equal((await openCamera()).live,false);assert.equal(x.stopped(),1)})
test('explicit synthetic mode never opens hardware and stops its animation',async()=>{const x=setup({search:'?testcam=1'}),camera=await openCamera();assert.equal(x.calls(),0);assert.equal(camera.live,false);camera.stop();assert.equal(x.cancelled(),1)})
