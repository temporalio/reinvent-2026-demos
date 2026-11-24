/** Corner reflections keep both straight image cuts outside the card. */
export function createMissionArtwork(ids:string[],random:()=>number=Math.random):Record<string,Record<string,string>> {
  const poses=[
    {top:'auto',bottom:'-5%',left:'auto',right:'-5%',transform:'none',width:'48%'},
    {top:'-5%',bottom:'auto',left:'auto',right:'-5%',transform:'scaleY(-1)',width:'48%'},
    {top:'auto',bottom:'-5%',left:'-5%',right:'auto',transform:'scaleX(-1)',width:'48%'},
    {top:'-5%',bottom:'auto',left:'-5%',right:'auto',transform:'rotate(180deg)',width:'48%'},
    {top:'auto',bottom:'-12%',left:'auto',right:'-12%',transform:'none',width:'60%'},
    {top:'-12%',bottom:'auto',left:'auto',right:'-12%',transform:'scaleY(-1)',width:'60%'},
    {top:'auto',bottom:'-12%',left:'-12%',right:'auto',transform:'scaleX(-1)',width:'60%'},
    {top:'-12%',bottom:'auto',left:'-12%',right:'auto',transform:'rotate(180deg)',width:'60%'},
  ]
  for(let i=poses.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[poses[i],poses[j]]=[poses[j],poses[i]]}
  return Object.fromEntries(ids.map((id,index)=>{
    const pose=poses[index%poses.length]
    return [id,{
      '--star-position':`${Math.round((index+random())*100/ids.length)}% ${Math.round(((index+3)%ids.length+random())*100/ids.length)}%`,
      '--sky-turn':`scaleX(${random()<.5?-1:1}) scaleY(${random()<.5?-1:1})`,
      '--rock-top':pose.top,'--rock-bottom':pose.bottom,'--rock-left':pose.left,'--rock-right':pose.right,
      '--rock-transform':pose.transform,'--rock-width':pose.width,
    }]
  }))
}
