import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
const context={};runInNewContext(readFileSync(new URL('../public/screensaver/asteroid-bounds.js',import.meta.url),'utf8'),context)
const reflect=context.reflectAsteroidPosition

test('travel stays unchanged between the logo barriers and reflects past each edge',()=>{
 assert.equal(reflect(50,10,90),50)
 assert.equal(reflect(5,10,90),15)
 assert.equal(reflect(95,10,90),85)
 assert.equal(reflect(-500,10,90)>=10,true)
 for(let y=-1000;y<=3000;y+=3.7)assert.ok(reflect(y,75,1800)>=75&&reflect(y,75,1800)<=1800)
})
test('the rock reverses direction at a barrier rather than sticking to it',()=>{
 assert.equal(reflect(11,10,90),11);assert.equal(reflect(10,10,90),10);assert.equal(reflect(9,10,90),11)
 assert.equal(reflect(89,10,90),89);assert.equal(reflect(90,10,90),90);assert.equal(reflect(91,10,90),89)
})
test('every rotated corner stays twelve pixels away from either logo strip',()=>{
 for(const width of [36,80,94.26]){
  const {min,max}=context.asteroidTravelBounds(72,1848,width),height=width*70.88/94.26
  for(let angle=0;angle<360;angle+=5){
   const r=angle*Math.PI/180,half=(Math.abs(Math.sin(r))*width+Math.abs(Math.cos(r))*height)/2
   assert.ok(min+height/2-half>=84-1e-8)
   assert.ok(max+height/2+half<=1836+1e-8)
  }
 }
})
test('a collapsed travel region has a stable midpoint',()=>{
 assert.equal(reflect(100,20,10),15);assert.equal(reflect(-5,10,10),10)
})
