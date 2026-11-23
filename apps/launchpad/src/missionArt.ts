/** Each main card gets one edge pose, keeping artwork behind readable content. */
export function createMissionArtwork(ids:string[],random:()=>number=Math.random):Record<string,Record<string,string>> {
  const poses=[
    {top:'auto',bottom:'-32%',left:'auto',right:'-24%',turn:-20},
    {top:'-45%',bottom:'auto',left:'auto',right:'-24%',turn:160},
    {top:'auto',bottom:'-35%',left:'-30%',right:'auto',turn:25},
    {top:'-45%',bottom:'auto',left:'-30%',right:'auto',turn:190},
    {top:'35%',bottom:'auto',left:'auto',right:'-40%',turn:80},
    {top:'40%',bottom:'auto',left:'-44%',right:'auto',turn:-90},
    {top:'auto',bottom:'-55%',left:'35%',right:'auto',turn:-145},
    {top:'-58%',bottom:'auto',left:'42%',right:'auto',turn:120},
  ]
  for(let i=poses.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[poses[i],poses[j]]=[poses[j],poses[i]]}
  return Object.fromEntries(ids.map((id,index)=>{
    const pose=poses[index%poses.length]
    return [id,{
      '--star-position':`${Math.round((index+random())*100/ids.length)}% ${Math.round(((index+3)%ids.length+random())*100/ids.length)}%`,
      '--sky-turn':`scaleX(${random()<.5?-1:1}) scaleY(${random()<.5?-1:1})`,
      '--rock-top':pose.top,'--rock-bottom':pose.bottom,'--rock-left':pose.left,'--rock-right':pose.right,
      '--rock-turn':`${pose.turn+Math.round(random()*24-12)}deg`,'--rock-width':'60%','--rock-height':'74%',
    }]
  }))
}
