import { hash, protocol, transact, uid } from '../runtime/protocol.ts';
import { ledgerCurrent } from '../verification/runner.ts';
import type { PRProvider, PullRequest } from './provider.ts';
// GitHub reports CLEAN only when the base and the required checks are settled. Every other merge
// state, and a missing one, needs a human look before shipping.
const CLEAN_MERGE_STATE='CLEAN';
export interface StackSpec { id:string; repoId:string; repo:string; numbers:number[]; owner:string; requireReview?:boolean; requireBehavior?:boolean; rootBase?:string }
export interface Frontier extends StackSpec { generation:number; digest:string; prs:PullRequest[]; checkedAt:string }
export async function refresh(spec:StackSpec,provider:PRProvider):Promise<Frontier> {
  if(!/^[a-zA-Z0-9._-]+$/.test(spec.id) || ['__proto__','constructor','prototype'].includes(spec.id))throw new Error('INVALID_STACK_ID');
  if(!spec.numbers.length || new Set(spec.numbers).size!==spec.numbers.length)throw new Error('INVALID_STACK');
  const prs:PullRequest[]=[]; for(const number of spec.numbers)prs.push(await provider.read(spec.repo,number));
  if(prs.some((p,i)=>p.repo!==spec.repo || p.number!==spec.numbers[i] || !p.headSha || !p.baseSha))throw new Error('STATE_UNCERTAIN');
  // A dependent base must equal the preceding head before that predecessor is merged.
  for(let i=1;i<prs.length;i++)if(prs[i-1].state!=='MERGED' && (prs[i].baseSha!==prs[i-1].headSha || Boolean(prs[i-1].headRef && prs[i].baseRef!==prs[i-1].headRef)))throw new Error('STACK_TOPOLOGY_MISMATCH');
  return transact('frontier-refreshed',spec.id,'provider',s=>{
    const old=s.frontiers[spec.id] as Frontier|undefined;
    if(old && (old.owner!==spec.owner || old.repo!==spec.repo || old.repoId!==spec.repoId))throw new Error('STACK_IDENTITY_CONFLICT');
    for(const e of Object.values(s.ledgers)) {
      const p=prs.find(p=>e.pr?.repoId===spec.repoId && e.pr.number===p.number);
      if(p && (!e.diffBase || e.diffBase.commitSha!==p.baseSha || e.pr!.headSha!==p.headSha))s.invalidations[e.id]={at:new Date().toISOString(),reason:'PR_BASE_OR_HEAD_CHANGED'};
    }
    // The shipping trunk is operator input, never a property of the PR under test. A persisted
    // value wins so a later refresh cannot retarget the trunk silently.
    const rootBase=old?.rootBase ?? spec.rootBase;
    if(!rootBase)throw new Error('STACK_ROOT_BASE_REQUIRED');
    if(old?.rootBase && spec.rootBase && spec.rootBase!==old.rootBase)throw new Error('STACK_ROOT_BASE_CHANGED');
    const digest=hash({prs,rootBase,requireReview:spec.requireReview!==false,requireBehavior:spec.requireBehavior!==false});
    const f:Frontier={...spec,rootBase,prs,digest,generation:(old?.generation ?? 0)+(old?.digest===digest?0:1),checkedAt:new Date().toISOString()};s.frontiers[spec.id]=f;return f;
  });
}
export function eligibility(f:Frontier):{number:number;eligible:boolean;blockers:string[]}[] {
  const s=protocol();let lower=false;
  return f.prs.map(p=>{
    if(p.state==='MERGED')return {number:p.number,eligible:false,blockers:['ALREADY_MERGED']};
    const blockers:string[]=[];
    if(lower)blockers.push('LOWER_UNMERGED');
    else if(f.rootBase && p.baseRef!==f.rootBase)blockers.push('FRONTIER_BASE_NOT_TRUNK');
    lower=true;
    if(p.state!=='OPEN')blockers.push('PR_NOT_OPEN');
    // Runtime callers can be plain JavaScript, so absent provider fields must still block.
    if(p.draft!==false)blockers.push('PR_DRAFT');
    if(p.reviewThreads?.status!=='checked')blockers.push('REVIEW_THREADS_NOT_CHECKED');
    else if(p.reviewThreads.unresolved>0)blockers.push('UNRESOLVED_REVIEW_THREADS');
    if(p.mergeState!==CLEAN_MERGE_STATE)blockers.push(`MERGE_STATE_${p.mergeState ?? 'MISSING'}`);
    if(p.mergeable!=='MERGEABLE')blockers.push(p.mergeable==='CONFLICTING'?'CONFLICT':'STATE_UNCERTAIN');
    if(p.review==='changes-requested' || f.requireReview!==false && p.review!=='approved')blockers.push('REVIEW_REQUIRED');
    if(p.ci!=='passed')blockers.push('CI_NOT_PASSED');
    const entries=Object.values(s.ledgers).filter(e=>e.pr?.repoId===f.repoId && e.pr.number===p.number && e.pr.headSha===p.headSha && e.fingerprint.kind==='committed' && e.fingerprint.commitSha===p.headSha);
    if(!entries.some(e=>e.diffBase?.commitSha===p.baseSha && e.contractAccepted && ledgerCurrent(e,e.fingerprint) && (f.requireBehavior===false || e.verdict==='unit-test-verified')))blockers.push('CURRENT_VERIFICATION_REQUIRED');
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

/** Native snapshot states, not fabricated Cursor watcher verdicts. No merging or polling. */
export function watchFrontier(f:Frontier,previous?:{number:number;headSha:string;digest:string}) {
 const target=f.prs.find(p=>p.state!=='MERGED');
 if(!target)return {state:'complete',frontier:null,digest:f.digest};
 if(target.state==='CLOSED')return {state:'closed',frontier:target.number,digest:f.digest};
 const decision=eligibility(f).find(d=>d.number===target.number)!;
 const advanced=previous && previous.number!==target.number;
 return {state:advanced?'advance':decision.eligible?'reviewable':'waiting',frontier:target.number,headSha:target.headSha,digest:f.digest,blockers:decision.blockers,autoMergeRequested:target.autoMergeRequested ?? false,queueState:'not-claimed',stopBeforeMerge:true};
}
