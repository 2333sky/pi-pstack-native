import type { WorkflowRecord } from '../runtime/types.ts';
export function metrics(workflows:WorkflowRecord[]) {
  const calls=workflows.flatMap(w=>Object.values(w.calls));
  const complete=calls.filter(c=>c.state==='completed');const verified=complete.filter(c=>c.verification?.status==='passed');
  const known=calls.filter(c=>c.usage?.tokens!==null && c.usage?.tokens!==undefined);
  const costs=calls.filter(c=>c.usage?.cost!==null && c.usage?.cost!==undefined);
  return {attempts:calls.reduce((n,c)=>n+c.attempt,0),completed:complete.length,verifiedRecorded:verified.length,verificationRate:complete.length?verified.length/complete.length:null,
    tokens:known.length===calls.length?known.reduce((n,c)=>n+c.usage!.tokens!,0):null,cost:costs.length===calls.length?costs.reduce((n,c)=>n+c.usage!.cost!,0):null,
    blocked:calls.filter(c=>c.verification?.status==='blocked').length,staleRecorded:calls.filter(c=>c.verification?.status==='stale').length,elapsedMs:calls.reduce((n,c)=>n+(c.usage?.elapsedMs ?? 0),0),
    interpretation:'Recorded gate results; use current artifact checks before delivery. Unknown usage is never counted as zero.'};
}
