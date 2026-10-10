import { hash, protocol, transact, uid } from '../runtime/protocol.ts';
import { ledgerCurrent } from '../verification/runner.ts';
import type { PRProvider, PullRequest } from './provider.ts';
export interface StackSpec { id:string; repoId:string; repo:string; numbers:number[]; owner:string; requireReview?:boolean; requireBehavior?:boolean }
export interface Frontier extends StackSpec { generation:number; digest:string; prs:PullRequest[]; checkedAt:string }
export async function refresh(spec:StackSpec,provider:PRProvider):Promise<Frontier> {
  if(!/^[a-zA-Z0-9._-]+$/.test(spec.id) || ['__proto__','constructor','prototype'].includes(spec.id))throw new Error('INVALID_STACK_ID');
  if(!spec.numbers.length || new Set(spec.numbers).size!==spec.numbers.length)throw new Error('INVALID_STACK');
  const prs:PullRequest[]=[]; for(const number of spec.numbers)prs.push(await provider.read(spec.repo,number));
  if(prs.some((p,i)=>p.repo!==spec.repo || p.number!==spec.numbers[i] || !p.headSha || !p.baseSha))throw new Error('STATE_UNCERTAIN');
  // A dependent base must equal the preceding head before that predecessor is merged.
  for(let i=1;i<prs.length;i++)if(prs[i-1].state!=='MERGED' && prs[i].baseSha!==prs[i-1].headSha)throw new Error('STACK_TOPOLOGY_MISMATCH');
  const digest=hash(prs);return transact('frontier-refreshed',spec.id,'provider',s=>{
    const old=s.frontiers[spec.id] as Frontier|undefined;
    if(old && (old.owner!==spec.owner || old.repo!==spec.repo || old.repoId!==spec.repoId))throw new Error('STACK_IDENTITY_CONFLICT');
    const f:Frontier={...spec,prs,digest,generation:(old?.generation ?? 0)+(old?.digest===digest?0:1),checkedAt:new Date().toISOString()};s.frontiers[spec.id]=f;return f;
  });
}
export function eligibility(f:Frontier):{number:number;eligible:boolean;blockers:string[]}[] {
  const s=protocol();let lower=false;
  return f.prs.map(p=>{
    if(p.state==='MERGED')return {number:p.number,eligible:false,blockers:['ALREADY_MERGED']};
    const blockers:string[]=[];
    if(lower)blockers.push('LOWER_UNMERGED');
    lower=true;
    if(p.state!=='OPEN')blockers.push('PR_NOT_OPEN');
    if(p.mergeable!=='MERGEABLE')blockers.push(p.mergeable==='CONFLICTING'?'CONFLICT':'STATE_UNCERTAIN');
    if(p.review==='changes-requested' || f.requireReview!==false && p.review!=='approved')blockers.push('REVIEW_REQUIRED');
    if(p.ci!=='passed')blockers.push('CI_NOT_PASSED');
    const entries=Object.values(s.ledgers).filter(e=>e.pr?.repoId===f.repoId && e.pr.number===p.number && e.pr.headSha===p.headSha && e.fingerprint.kind==='committed' && e.fingerprint.commitSha===p.headSha);
    if(!entries.some(e=>e.contractAccepted && ledgerCurrent(e,e.fingerprint) && (f.requireBehavior===false || e.verdict==='unit-test-verified')))blockers.push('CURRENT_VERIFICATION_REQUIRED');
    return {number:p.number,eligible:blockers.length===0,blockers};
  });
}
export function authorizeMerge(f:Frontier,number:number,actor:string):string {
  if(actor!=='human-cli')throw new Error('HUMAN_AUTHORIZATION_REQUIRED');
  const token=uid('approval');transact('merge-authorized',f.id,actor,s=>{s.approvals[token]={stackId:f.id,number,digest:f.digest,generation:f.generation,expiresAt:Date.now()+5*60_000,used:false};return {token,number};});return token;
}
export async function ship(spec:StackSpec,provider:PRProvider,options:{token?:string;dryRun?:boolean}={}):Promise<unknown> {
  const f=await refresh(spec,provider);const decisions=eligibility(f);
  if(options.dryRun!==false)return {frontier:f,decisions,dryRun:true};
  const approval=options.token?protocol().approvals[options.token]:undefined;
  if(!approval || approval.stackId!==f.id || approval.digest!==f.digest || approval.generation!==f.generation || approval.used || approval.expiresAt<Date.now())throw new Error('AUTHORIZATION_MISSING_OR_STALE');
  const target=f.prs.find(p=>p.number===approval.number)!;
  if(!decisions.find(d=>d.number===target?.number)?.eligible)throw new Error('SHIPPING_BLOCKED');
  // Query twice, then use provider's server-side expected-head precondition.
  const checked=await refresh(spec,provider);
  if(checked.digest!==f.digest || checked.generation!==f.generation)throw new Error('FRONTIER_CHANGED');
  transact('merge-requested',f.id,'shipping-gate',s=>{
    const a=s.approvals[options.token!];if(a.used)throw new Error('AUTHORIZATION_CONSUMED');a.used=true;
    return {number:target.number,head:target.headSha};
  });
  await provider.merge(target);
  const actual=await provider.read(spec.repo,target.number);
  if(actual.state!=='MERGED')throw new Error('MERGE_UNCONFIRMED');
  transact('merge-confirmed',f.id,'provider',()=>({number:actual.number,head:actual.headSha}));
  return {merged:actual.number,frontier:await refresh(spec,provider)};
}
