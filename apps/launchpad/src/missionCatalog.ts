type Mission = {id:string}
export function missionVisible(demo:Mission,filter:string,hidden:Record<string,boolean>={}):boolean {
  if(hidden[demo.id])return false
  if(filter==='holodeck')return ['flight-simulator','photo-booth'].includes(demo.id)
  if(filter==='aws-ai')return ['loan','no-roads','agent-harness','agentic-sdlc','agentcore-video','agentcore-research'].includes(demo.id)
  return !['flight-simulator','photo-booth','agentcore-video'].includes(demo.id)
}
