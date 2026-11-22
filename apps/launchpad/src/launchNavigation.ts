/** Crew selection takes precedence over a leftover demo deep link. */
export function initialLaunchScreen(search:string,hasDemo:boolean):'crew'|'demo'|'screensaver' {
  return new URLSearchParams(search).get('screen')==='crew'?'crew':hasDemo?'demo':'screensaver'
}
