/** Only the configured same-origin workflow list and its descendants may be embedded. */
export function workflowTarget(value:string,configuredUi:string,origin:string):string|null {
  try {
    const url=new URL(value,origin)
    const base=new URL(configuredUi,origin)
    const root=base.pathname.replace(/\/workflows(?:\/.*)?$/, '/workflows').replace(/\/$/,'')
    return url.origin===origin && base.origin===origin && (url.pathname===root || url.pathname.startsWith(`${root}/`)) ? url.href : null
  } catch {return null}
}
