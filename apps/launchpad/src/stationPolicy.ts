export type LaunchRuntime = { mode:string; availableDemos?:string[] }
export type LaunchSettings = { demo_enabled:Record<string,boolean>; network_mode:'online'|'offline' }
const localDemos = new Set(['tacos','money-transfer','data-pipeline','flight-simulator','photo-booth','no-roads','agentcore-research'])

/** Apply policy to new launches; callers retain an already admitted session. */
export function launchRestriction(demo:{id:string;tentative:boolean;kind?:string},runtime:LaunchRuntime,settings:LaunchSettings,ready:boolean):string|null {
  if(!ready)return 'Loading station settings…'
  if(settings.demo_enabled[demo.id]===false)return 'Disabled for this station'
  if(demo.kind==='agentcore' && runtime.mode!=='local')return 'AgentCore runtime awaits Fieldkit support'
  if(demo.kind==='coming-soon')return 'Coming soon — demo integration pending'
  if(demo.kind==='video')return settings.network_mode==='offline' && runtime.mode!=='local'?'Offline mode requires the local demo runner':null
  if(demo.tentative && runtime.mode!=='local')return 'Requires booth GitHub setup'
  if(runtime.availableDemos && !runtime.availableDemos.includes(demo.id))return 'Not running on this station'
  if(settings.network_mode==='offline') {
    if(runtime.mode!=='local')return 'Offline mode requires the local demo runner'
    if(!localDemos.has(demo.id))return 'Internet required'
  }
  return null
}
