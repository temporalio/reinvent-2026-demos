/** Feedback sessions on this machine keep the selected screen open. */
export function isLocalReview(hostname:string):boolean {
  return ['localhost','127.0.0.1','[::1]','::1'].includes(hostname)
}

/** Crew selection takes precedence over a leftover demo deep link. */
export function initialLaunchScreen(search:string,hasDemo:boolean,hostname=''):'crew'|'demo'|'screensaver' {
  return new URLSearchParams(search).get('screen')==='crew'?'crew':hasDemo?'demo':isLocalReview(hostname)?'crew':'screensaver'
}
