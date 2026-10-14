import { execFileSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { fingerprint, git } from '../artifacts/fingerprint.ts';
import { hash, protocol, transact } from '../runtime/protocol.ts';
import { homePath } from '../runtime/home.ts';
import { preparePR, openPreparedPR } from './prepare.ts';
import type { PullRequest } from './provider.ts';

export interface StackLane {key:string;cwd:string;head:string;ledgerId:string;title:string}
export interface StackInput {repo:string;rootBase:string;owner:string;lanes:StackLane[]}
export interface StackPlan extends StackInput {id:string;rootSha:string;entries:(StackLane & {base:string;baseSha:string;headSha:string;patchId:string})[]}
export interface StackProvider {
 branchHead(repo:string,branch:string):Promise<string>;
 find(repo:string,head:string):Promise<number|null>;
 read(repo:string,number:number):Promise<PullRequest>;
 open(repo:string,base:string,head:string,title:string,bodyFile:string):Promise<string>;
}
function validBranch(branch:string):boolean {return typeof branch==='string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) && !branch.includes('..') && !branch.includes('//') && !branch.endsWith('/') && !branch.endsWith('.lock');}
function laneMatches(pr:PullRequest,repo:string,lane:StackPlan['entries'][number]):boolean {
 return pr.repo===repo && pr.state==='OPEN' && pr.baseRef===lane.base && pr.baseSha===lane.baseSha && pr.headSha===lane.headSha && pr.draft===false;
}
function patchId(cwd:string,base:string,head:string):string {
 const diff=execFileSync('git',['-C',cwd,'diff','--no-ext-diff','--no-textconv','--binary',base,head],{encoding:'utf8',maxBuffer:64*1024*1024});
 const result=execFileSync('git',['patch-id','--stable'],{input:diff,encoding:'utf8',maxBuffer:1024}).trim().split(/\s/)[0];
 if(!/^[a-f0-9]{40}$/.test(result))throw new Error('STACK_EMPTY_PATCH');return result;
}
export async function prepareStack(input:StackInput,provider:StackProvider):Promise<StackPlan> {
 if(!/^[\w.-]+\/[\w.-]+$/.test(input.repo) || !validBranch(input.rootBase) || !input.owner?.trim() || !Array.isArray(input.lanes) || !input.lanes.length || input.lanes.length>32)throw new Error('INVALID_STACK_PLAN');
 if(new Set(input.lanes.map(l=>l.key)).size!==input.lanes.length || new Set(input.lanes.map(l=>l.head)).size!==input.lanes.length || input.lanes.some(l=>!validBranch(l.head) || l.head===input.rootBase || !l.key || !l.title))throw new Error('INVALID_STACK_LANES');
 const rootSha=await provider.branchHead(input.repo,input.rootBase);
 if(!/^[a-f0-9]{40}$/.test(rootSha))throw new Error('STACK_BASE_UNKNOWN');
 let base=input.rootBase,baseSha=rootSha,repoId:string|undefined;const entries:StackPlan['entries']=[],worktrees=new Set<string>();
 for(const lane of input.lanes) {
  const cwd=realpathSync(lane.cwd),fp=fingerprint(cwd,'committed');
  if(worktrees.has(cwd) || repoId && fp.repoId!==repoId)throw new Error('STACK_WORKTREE_IDENTITY');worktrees.add(cwd);repoId=fp.repoId;
  if(git(cwd,['branch','--show-current'])!==lane.head)throw new Error('STACK_BRANCH_MISMATCH');
  if(await provider.branchHead(input.repo,lane.head)!==fp.commitSha)throw new Error('REMOTE_BRANCH_NOT_VERIFIED');
  try{git(cwd,['merge-base','--is-ancestor',baseSha,fp.commitSha]);}catch{throw new Error('STACK_TOPOLOGY_MISMATCH');}
  const prepared=preparePR(cwd,lane.ledgerId,{repo:input.repo,base,head:lane.head,title:lane.title});
  const ledger=protocol().ledgers[lane.ledgerId];
  if(ledger.diffBase?.commitSha!==baseSha || ledger.verdict!=='unit-test-verified')throw new Error('STACK_PARENT_VERIFICATION_REQUIRED');
  entries.push({...lane,cwd,base,baseSha,headSha:prepared.headSha,patchId:patchId(cwd,baseSha,fp.commitSha)});base=lane.head;baseSha=fp.commitSha;
 }
 const stable={repo:input.repo,rootBase:input.rootBase,owner:input.owner,lanes:entries.map(({key,cwd,head,ledgerId,title})=>({key,cwd,head,ledgerId,title})),rootSha,entries},plan={...stable,id:`stack-${hash(stable).slice(0,20)}`};
 transact('stack-prepared',plan.id,input.owner,()=>({repo:plan.repo,rootSha,entries:entries.map(e=>({key:e.key,base:e.base,head:e.head,headSha:e.headSha,patchId:e.patchId}))}));return plan;
}
export async function openStack(plan:StackPlan,provider:StackProvider,approve=false):Promise<unknown> {
 const current=await prepareStack({repo:plan.repo,rootBase:plan.rootBase,owner:plan.owner,lanes:plan.lanes},provider);
 if(current.id!==plan.id || hash(current.entries)!==hash(plan.entries))throw new Error('STACK_PLAN_STALE');
 if(!approve)return {plan:current,dryRun:true,mergeAuthorized:false};
 const opened:{key:string;number?:number;url?:string;reused:boolean}[]=[];
 for(const lane of plan.entries) {
  // Recheck both refs immediately before each creation; stop rather than rewrite topology.
  if(await provider.branchHead(plan.repo,lane.base)!==lane.baseSha || await provider.branchHead(plan.repo,lane.head)!==lane.headSha)throw new Error('STACK_REFS_MOVED');
  const existing=await provider.find(plan.repo,lane.head);
  if(existing!==null) {
   const pr=await provider.read(plan.repo,existing);
   if(!laneMatches(pr,plan.repo,lane))throw new Error('STACK_EXISTING_PR_MISMATCH');
   opened.push({key:lane.key,number:existing,reused:true});continue;
  }
  const prepared=preparePR(lane.cwd,lane.ledgerId,{repo:plan.repo,base:lane.base,head:lane.head,title:lane.title});
  prepared.body=`## Why\n${lane.title}\n\n## What changed\nVerified stack unit ${lane.key}.\n\n## Scope\nOnly this branch relative to ${lane.base}.\n\n## Blast Radius\nReview this unit independently; dependencies land bottom-up. No merge authority.\n\n## Verification\nHead: ${lane.headSha}\nBase: ${lane.baseSha}\nPatch ID: ${lane.patchId}\nLedger: ${lane.ledgerId}\nIndependent semantic review and current remote CI remain required.\n`;
  const result=await openPreparedPR(lane.cwd,prepared,provider as any,true) as {url:string};
  // A ref can move between the last check and creation. Read the new PR back, or this lane's
  // verification would describe a commit the PR does not hold. Stop the stack and revoke the
  // lane's ledger when that happens.
  const created=await provider.find(plan.repo,lane.head);
  if(created===null)throw new Error('STACK_CREATED_PR_UNREADABLE');
  if(!laneMatches(await provider.read(plan.repo,created),plan.repo,lane)) {
   transact('stack-verification-stale',plan.id,plan.owner,s=>{s.invalidations[lane.ledgerId]={at:new Date().toISOString(),reason:'PR_CREATED_FROM_UNVERIFIED_REFS'};return {key:lane.key,number:created};});
   throw new Error('STACK_CREATED_PR_MISMATCH');
  }
  opened.push({key:lane.key,number:created,...result,reused:false});
 }
 transact('stack-opened',plan.id,plan.owner,()=>({opened,mergeAuthorized:false}));return {id:plan.id,opened,mergeAuthorized:false};
}
