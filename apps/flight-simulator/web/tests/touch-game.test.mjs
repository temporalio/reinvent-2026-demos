import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {existsSync} from 'node:fs'
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('.')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return next(url.href,context)}
 return next(specifier,context)
}})
const {Game}=await import('../src/flight/game.ts')
const {CONFIG}=await import('../src/flight/config.ts')
function game(){return new Game(Object.fromEntries(['onScenario','onBreak','onRepair','onCharge','onDeploy','onDurableEnd','onEmergency'].map(key=>[key,()=>{}])))}
test('cargo failure reduces accumulated score and repair stops the loss',()=>{
 const g=game();g.score=5000;g.breakRandom(['cargo']);g.update(1000)
 assert.ok(g.score<5000);assert.equal(g.cargoLost,CONFIG.CARGO_LOSS_PER_SEC)
 assert.ok(g.pendingEvents.some(event=>event.type==='cargo_loss'))
 assert.equal(g.tapRepair('cargo'),true);const score=g.score;g.update(1000);assert.ok(g.score>score);assert.equal(g.cargoLost,600)
})
test('cargo cannot reduce score below zero or overrun the last frame',()=>{
 const g=game();g.breakRandom(['cargo']);g.update(1000);assert.equal(g.score,0)
 g.elapsedMs=CONFIG.GAME_SECONDS*1000-10;g.score=1000;const loss=g.cargoLost;g.update(1000);assert.ok(g.cargoLost-loss<=6.001)
})
test('blasters cannot fire until repaired',()=>{
 const g=game();assert.equal(g.shot(),true);g.breakRandom(['blasters']);assert.equal(g.shot(),false);assert.equal(g.shots,1);g.tapRepair('blasters');assert.equal(g.shot(),true)
})
test('engines slow flight and earnings; shields multiply collision damage',()=>{
 const healthy=game(),broken=game();broken.breakRandom(['engines']);assert.ok(broken.speed<healthy.speed);assert.ok(broken.pointsPerSec<healthy.pointsPerSec)
 const shielded=game(),unshielded=game();unshielded.breakRandom(['shields']);shielded.hit('asteroid');unshielded.hit('asteroid');assert.equal(unshielded.damageTaken,shielded.damageTaken*2)
})
test('snapshots preserve lost cargo and Temporal thresholds across a reload',()=>{
 const g=game();g.score=12000;g.nextThreshold=20000;g.breakRandom(['cargo']);g.update(1000);const restored=game();restored.restore(g.snapshot());assert.equal(restored.cargoLost,g.cargoLost);assert.equal(restored.nextThreshold,20000);assert.equal(restored.broken('cargo'),true)
})
