/** Keep validation metadata, never echoed request bodies such as captured photos. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues: {field:string;type:string}[];
  constructor(status:number, payload:unknown) {
    super(`Request failed (HTTP ${status}).`);
    this.name='ApiError';
    this.status=status;
    const detail=(payload && typeof payload==='object' && 'detail' in payload) ? payload.detail : null;
    this.issues=Array.isArray(detail)?detail.slice(0,8).flatMap(issue=>{
      if(!issue || typeof issue!=='object' || !Array.isArray(issue.loc) || typeof issue.type!=='string')return [];
      return [{field:issue.loc.filter((part:unknown)=>typeof part==='string').join('.').slice(0,100),type:issue.type.slice(0,60)}];
    }):[];
  }
}

export function requiresEmailAtCapture(error:unknown):boolean {
  return error instanceof ApiError && error.status===422 && error.issues.some(issue=>
    issue.field==='body.email' && ['missing','value_error.missing'].includes(issue.type));
}
