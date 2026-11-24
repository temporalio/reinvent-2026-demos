import type {DisplaySettings} from './stationControl'

/** Shared geometry for the station surface and the operator's draft outline. */
export function displayRectangle(display:Pick<DisplaySettings,'width'|'height'|'x'|'y'>,bounds:{width:number;height:number}) {
 const width=bounds.width*display.width/100,height=bounds.height*display.height/100
 const xLimit=(bounds.width-width)/2,yLimit=(bounds.height-height)/2
 const offsetX=Math.max(-xLimit,Math.min(xLimit,display.x)),offsetY=Math.max(-yLimit,Math.min(yLimit,display.y))
 return {x:xLimit+offsetX,y:yLimit+offsetY,width,height,offsetX,offsetY}
}
