import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createMissionArtwork} from '../src/missionArt.ts'
test('eight cards receive distinct edge poses and starfield crops',()=>{
 const ids=Array.from({length:8},(_,i)=>String(i)),art=createMissionArtwork(ids,()=>.25),rows=Object.values(art)
 assert.equal(rows.length,8)
 assert.equal(new Set(rows.map(r=>[r['--rock-top'],r['--rock-bottom'],r['--rock-left'],r['--rock-right']].join(','))).size,8)
 assert.equal(new Set(rows.map(r=>r['--star-position'])).size,8)
 for(const row of rows)assert.ok(['--rock-top','--rock-bottom','--rock-left','--rock-right'].some(key=>row[key].startsWith('-')))
 assert.notDeepEqual(art,createMissionArtwork(ids,()=>.75))
})
