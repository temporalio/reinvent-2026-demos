import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../public/screensaver/index.html',import.meta.url),'utf8')
const decks=JSON.parse(source.match(/const DECKS = (\[[\s\S]*?\]);/)[1])
const catalog=JSON.parse(readFileSync(new URL('../src/catalog.json',import.meta.url),'utf8'))
test('each catalog entry has a planet and the requested category color',()=>{
 assert.deepEqual(decks.map(d=>d.id).sort(),catalog.map(d=>d.id).sort())
 const groups={'--persona-solarian':['tacos','money-transfer','data-pipeline'],'--status-waiting':['loan','no-roads'],'--persona-space-wizard':['agent-harness','agentic-sdlc'],'--persona-envoy':['photo-booth','flight-simulator'],'--persona-captain':['agentcore-video','agentcore-research']}
 for(const [color,ids] of Object.entries(groups))for(const id of ids){const d=decks.find(d=>d.id===id);assert.equal(d.color,color,id);assert.equal(d.url,'/?screen=crew')}
})
