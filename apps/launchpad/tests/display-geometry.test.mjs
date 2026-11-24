import {test} from 'node:test'
import assert from 'node:assert/strict'
import {displayRectangle} from '../src/displayGeometry.ts'

test('draft rectangle uses the same percentage sizes and pixel offsets as the screen',()=>{
 assert.deepEqual(displayRectangle({width:80,height:60,x:20,y:-30},{width:1000,height:500}),{x:120,y:70,width:800,height:300,offsetX:20,offsetY:-30})
})
test('oversized offsets remain within bounds, including 100 percent and resized screens',()=>{
 for(const bounds of [{width:1080,height:1920},{width:1920,height:1080},{width:500,height:300}]){
  for(const width of [40,90,100])for(const height of [30,78,100])for(const offset of [-7680,0,7680]){
   const rect=displayRectangle({width,height,x:offset,y:-offset},bounds)
   assert.ok(rect.x>=0&&rect.y>=0)
   assert.ok(rect.x+rect.width<=bounds.width&&rect.y+rect.height<=bounds.height)
  }
 }
})
