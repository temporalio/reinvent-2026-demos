const KEY='reinvent-idle-paused-v1'
type StorageAccess=Pick<Storage,'getItem'|'setItem'>

/** This browser's staff pause survives refreshes without changing other stations. */
export function readIdlePaused(storage?:StorageAccess):boolean {
  try{return (storage??window.localStorage).getItem(KEY)==='true'}catch{return false}
}
export function saveIdlePaused(storage:StorageAccess|undefined,paused:boolean):void {
  try{(storage??window.localStorage).setItem(KEY,String(paused))}catch{/* The in-memory toggle still works. */}
}
