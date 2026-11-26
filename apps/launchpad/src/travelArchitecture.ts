import type {LiveCursor} from './workflowHistory'

/** Highlight only the phase reported by the app or recorded Activity metadata. */
export function travelArchitectureNodes(cursor?:LiveCursor|null):string[] {
 if(!cursor)return []
 const step=cursor.step
 if(cursor.terminal)return ['temporal','board']
 if(step==='approval')return ['human','temporal']
 if(step==='input')return ['traveler','api','temporal']
 if(step==='model'||step.startsWith('gemini_'))return ['worker','gemini']
 if(step==='run_travel_code')return ['worker','sandbox']
 if(step==='tool'||['search_flights','search_hotels','book_flight','book_hotel','get_seat_map','select_seat'].includes(step))return ['worker','sandbox','tools']
 return []
}
