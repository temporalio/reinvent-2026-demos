import fs from 'node:fs';
// Use a dedicated headless test browser, never a visitor's browser session.
// Usage: node scripts/local/check-browser-memory.mjs <browser-CDP-URL> [cycles] [output.json]
const endpoint=process.argv[2],cycles=Number(process.argv[3]||90);
if(!endpoint||!Number.isInteger(cycles)||cycles<1)throw Error('Provide a test browser CDP URL and positive cycle count');
const http=endpoint.replace('ws:','http:').split('/devtools/')[0];
const target=(await(await fetch(http+'/json/list')).json()).find(t=>t.type==='page'&&t.url.includes('localhost:15111'));
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map();
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});}
socket.addEventListener('message',async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);}if(m.method==='Fetch.requestPaused'){const p=m.params;const block=!['GET','HEAD','OPTIONS'].includes(p.request.method)||/api\/(scenarios|suggestions|analyze)/.test(p.request.url);await send(block?'Fetch.failRequest':'Fetch.continueRequest',block?{requestId:p.requestId,errorReason:'BlockedByClient'}:{requestId:p.requestId}).catch(()=>{});}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+JSON.stringify(r.exceptionDetails.exception));return r.result?.value;}
async function until(expression){for(let i=0;i<100;i++){if(await ev(expression))return;await sleep(100);}throw Error('Timed out: '+expression);}
await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.pathname.startsWith('/photobooth/')){const u=new URL(location.href);u.searchParams.set('testcam','1');history.replaceState(null,'',u);}`});
await send('Page.navigate',{url:'http://localhost:15111/?screen=crew&memory-check='+Date.now()});await until(`!!document.querySelector('.idle-toggle')`);
if(await ev(`document.querySelector('.idle-toggle').getAttribute('aria-pressed')==='true'`))await ev(`document.querySelector('.idle-toggle').click()`);
await send('Network.setCacheDisabled',{cacheDisabled:false});
const before=await ev('performance.timeOrigin');
async function sample(cycle){await sleep(1200);await send('HeapProfiler.collectGarbage');await sleep(200);const heap=await send('Runtime.getHeapUsage'),dom=await send('Memory.getDOMCounters');const row={cycle,...heap,...dom};console.log(JSON.stringify(row));return row;}
const samples=[await sample(0)];
const demos=['tacos','money-transfer','data-pipeline','loan','no-roads','agent-harness','agentic-sdlc','flight-simulator','photo-booth'];
for(let i=0;i<cycles;i++){
 const demo=demos[i%demos.length];
 await ev(`[...document.querySelectorAll('footer button')].find(b=>b.textContent==='Screensaver').click()`);
 await until(`!!document.querySelector('iframe.attract')?.contentDocument?.querySelector('.planets') && document.querySelector('iframe.attract').contentDocument.readyState==='complete'`);
 await sleep(50);
 await ev(`document.querySelector('iframe.attract').contentDocument.dispatchEvent(new CustomEvent('reinvent:launch',{detail:{demoId:${JSON.stringify(demo)}}}))`);
 await until(`!!document.querySelector('.app-viewport iframe')`);
 await sleep(demo==='flight-simulator'?2500:700);
 if(i%3===0)await ev(`document.querySelector('[role=tab][id$="-architecture"]')?.click()`);
 if(i%3===1)await ev(`document.querySelector('[role=tab][id$="-code"]')?.click()`);
 await ev(`[...document.querySelectorAll('footer button')].find(b=>b.textContent==='Crew').click()`);
 await until(`!!document.querySelector('.crew-picker') || !!document.querySelector('.launchpad-crew')`);
 if((i+1)%10===0)samples.push(await sample(i+1));
}
const result={cycles,hostReloaded:before!==await ev('performance.timeOrigin'),samples};fs.writeFileSync(process.argv[4]||'tmp/browser-memory-results.json',JSON.stringify(result,null,2));console.log('DONE');socket.close();
