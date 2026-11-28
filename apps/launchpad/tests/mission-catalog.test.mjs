import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {missionVisible} from '../src/missionCatalog.ts'
const catalog=JSON.parse(readFileSync(new URL('../src/catalog.json',import.meta.url),'utf8'))
test('video is AI/AWS only; research comes last in both lists',()=>{
 const all=catalog.filter(d=>missionVisible(d,'all')).map(d=>d.id),aws=catalog.filter(d=>missionVisible(d,'aws-ai')).map(d=>d.id)
 assert.equal(all.length,8);assert.equal(aws.length,6);assert.equal(all.at(-1),'agentcore-research');assert.ok(!all.includes('agentcore-video'))
 assert.deepEqual(aws.slice(-2),['agentcore-video','agentcore-research']);assert.deepEqual(catalog.filter(d=>missionVisible(d,'holodeck')).map(d=>d.id),['flight-simulator','photo-booth'])
})

test('hidden demos are absent from every relevant mission list; off remains a visible policy',()=>{
 for(const demo of catalog)for(const filter of ['all','aws-ai','holodeck']) {
  assert.equal(missionVisible(demo,filter,{[demo.id]:true}),false)
  assert.equal(missionVisible(demo,filter,{[demo.id]:false}),missionVisible(demo,filter))
 }
})
