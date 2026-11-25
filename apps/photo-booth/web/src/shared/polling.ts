/** One request at a time; stop cancels both the pending request and next tick. */
export function poll<T>(fn:(signal:AbortSignal)=>Promise<T>,onValue:(value:T)=>boolean|void,everyMs=700):()=>void {
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let stopped=false;
  function stop(){stopped=true;controller.abort();clearTimeout(timer);}
  async function tick(){
    try {
      const value=await fn(controller.signal);
      if(stopped)return;
      if(onValue(value)===true){stop();return;}
    }catch{/* Keep the last result; bounded requests retry on the next tick. */}
    if(!stopped)timer=setTimeout(tick,everyMs);
  }
  void tick();
  return stop;
}
