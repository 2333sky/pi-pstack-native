import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {git,fingerprint} from '../src/artifacts/fingerprint.ts';
import {verify} from '../src/verification/runner.ts';
import {prepareStack,openStack} from '../src/delivery/stack.ts';
import {collectReviewThreads} from '../src/delivery/review-threads.ts';
import {refresh,eligibility,watchFrontier} from '../src/delivery/frontier.ts';
import type {PullRequest} from '../src/delivery/provider.ts';

test('linear PR stack has per-parent verification, dry-run, head-bound opening, idempotent retry and stale-plan rejection',async()=>{
 const dir=mkdtempSync(join(process.cwd(),'.stack-test-')),previous=process.env.PSTACK_NATIVE_HOME;process.env.PSTACK_NATIVE_HOME=join(dir,'state');
 try{
  const root=join(dir,'root');mkdirSync(root);git(root,['init','-q','-b','main']);git(root,['config','user.name','Test']);git(root,['config','user.email','test@example.invalid']);git(root,['remote','add','origin','https://github.com/test/stack.git']);writeFileSync(join(root,'base'),'base');git(root,['add','.']);git(root,['commit','-qm','base']);
  const refs=new Map([['main',git(root,['rev-parse','HEAD'])]]),prs=new Map<number,PullRequest>(),opens:{base:string;head:string;body:string}[]=[];
  const provider={async branchHead(_repo:string,head:string){return refs.get(head)!;},async find(_repo:string,head:string){return [...prs.values()].find(p=>p.headRef===head)?.number ?? null;},async read(_repo:string,n:number){return structuredClone(prs.get(n)!);},async open(repo:string,base:string,head:string,_title:string,bodyFile:string){const number=prs.size+1;opens.push({base,head,body:readFileSync(bodyFile,'utf8')});prs.set(number,{repo,number,headRef:head,baseRef:base,baseSha:refs.get(base)!,headSha:refs.get(head)!,state:'OPEN',mergeable:'MERGEABLE',ci:'passed',review:'approved',reviewThreads:{status:'checked',unresolved:0,bugbotUnresolved:0,total:0}});return `https://github.com/test/stack/pull/${number}`;}};
  const lanes:import("../src/delivery/stack.ts").StackLane[]=[];let parent=refs.get('main')!;
  for(let i=1;i<=2;i++) {
   const cwd=join(dir,`lane${i}`),head=`feature/lane${i}`;git(root,['worktree','add','-qb',head,cwd,parent]);writeFileSync(join(cwd,`unit${i}`),'ready');git(cwd,['add','.']);git(cwd,['commit','-qm',`unit${i}`]);const fp=fingerprint(cwd,'committed');refs.set(head,fp.commitSha);
   const cmd=[process.execPath,'-e',`process.exit(require('node:fs').readFileSync('unit${i}','utf8')==='ready'?0:1)`];
   const b:any={id:`lane${i}`,revision:1,contractLevel:'strict',goal:'unit',scope:{include:['**'],exclude:[],repoId:fp.repoId},contextRefs:[],acceptance:[{id:'done',description:'ready',required:true,gateIds:['surface']}],verification:[{id:'surface',kind:'command',command:cmd,sideEffect:'none',category:'behavior'}],timeboxSeconds:30,forbidden:['remote-write'],standingOrders:[],reportFormat:'task-report-v1'};
   const report:any={status:'completed',artifactRefs:[],base:parent,head:fp.commitSha,commandsRun:[],evidenceRefs:[],deviations:[],unresolved:[],nextActions:[]};
   const ledger=await verify(cwd,b,{pr:{repoId:fp.repoId,number:i,headSha:fp.commitSha,baseSha:parent},report,policy:{commands:[cmd]}});assert.equal(ledger.contractAccepted,true);
   lanes.push({key:`unit${i}`,cwd,head,ledgerId:ledger.id,title:`Unit ${i}`});parent=fp.commitSha;
  }
  const plan=await prepareStack({repo:'test/stack',rootBase:'main',owner:'operator',lanes},provider);
  assert.deepEqual(plan.entries.map(e=>e.base),['main','feature/lane1']);assert.ok(plan.entries.every(e=>/^[a-f0-9]{40}$/.test(e.patchId)));
  await openStack(plan,provider);assert.equal(opens.length,0);
  await openStack(plan,provider,true);assert.deepEqual(opens.map(p=>[p.base,p.head]),[['main','feature/lane1'],['feature/lane1','feature/lane2']]);assert.ok(opens.every(p=>p.body.includes('## Verification') && p.body.includes('Patch ID')));
  await openStack(plan,provider,true);assert.equal(opens.length,2);
  prs.get(2)!.baseRef='main';await assert.rejects(openStack(plan,provider,true),/EXISTING_PR_MISMATCH/);prs.get(2)!.baseRef='feature/lane1';
  const spec={id:'stack-fixture',repo:'test/stack',repoId:fingerprint(root).repoId,numbers:[1,2],owner:'operator'};
  const f=await refresh(spec,provider as any);assert.equal(watchFrontier(f).state,'reviewable');assert.deepEqual(eligibility(f)[1].blockers,['LOWER_UNMERGED']);
  prs.get(2)!.baseRef='main';await assert.rejects(refresh(spec,provider as any),/TOPOLOGY/);prs.get(2)!.baseRef='feature/lane1';
  prs.get(1)!.state='MERGED';const advanced=await refresh(spec,provider as any);assert.ok(eligibility(advanced)[1].blockers.includes('FRONTIER_BASE_NOT_TRUNK'));assert.equal(watchFrontier(advanced,{number:1,headSha:prs.get(1)!.headSha,digest:f.digest}).state,'advance');prs.get(1)!.state='OPEN';
  prs.get(1)!.reviewThreads!.unresolved=1;assert.ok(eligibility(await refresh(spec,provider as any))[0].blockers.includes('UNRESOLVED_REVIEW_THREADS'));
  prs.get(1)!.reviewThreads=undefined;assert.ok(eligibility(await refresh(spec,provider as any))[0].blockers.includes('REVIEW_THREADS_NOT_CHECKED'));
  refs.set('main','f'.repeat(40));await assert.rejects(openStack(plan,provider,true));assert.equal(opens.length,2);
 }finally{if(previous===undefined)delete process.env.PSTACK_NATIVE_HOME;else process.env.PSTACK_NATIVE_HOME=previous;rmSync(dir,{recursive:true,force:true});}
});
const page=(nodes:any[],next:string|null)=>({data:{repository:{pullRequest:{reviewThreads:{nodes,pageInfo:{hasNextPage:next!==null,endCursor:next}}}}}});
const thread=(id:string,resolved:boolean)=>({id,isResolved:resolved,comments:{nodes:[{author:{login:'bugbot[bot]'},createdAt:'2026-10-14T00:00:00Z'}]}});
test('review threads beyond page one block; cursor loops, incomplete pages and API errors fail closed',async()=>{
 const calls:(string|null)[]=[];const summary=await collectReviewThreads(async cursor=>{calls.push(cursor);return cursor===null?page(Array.from({length:100},(_,i)=>thread(String(i),true)),'next'):page([thread('late',false)],null);});
 assert.equal(summary.total,101);assert.equal(summary.unresolved,1);assert.equal(summary.bugbotUnresolved,1);assert.deepEqual(calls,[null,'next']);
 await assert.rejects(collectReviewThreads(async()=>page([], 'repeat')),/CURSOR_REPEATED/);
 await assert.rejects(collectReviewThreads(async()=>({data:{repository:{pullRequest:{reviewThreads:{nodes:[],pageInfo:{hasNextPage:true,endCursor:null}}}}}})),/CURSOR/);
 await assert.rejects(collectReviewThreads(async()=>({errors:[{message:'rate limited'}]})),/UNAVAILABLE/);
});
test('actual GitHub adapter paginates reviews and rejects a moved PR during its read',async()=>{
 const {GitHubCLI}=await import('../src/delivery/provider.ts');let pages=0,reads=0,moved=false;
 const execute=(args:string[])=>{
  if(args[0]==='pr' && args[1]==='view') {reads++;return JSON.stringify({number:1,headRefOid:moved && reads%2===0?'c'.repeat(40):'b'.repeat(40),baseRefOid:'a'.repeat(40),headRefName:'feature/a',baseRefName:'main',state:'OPEN',isDraft:false,mergeable:'MERGEABLE',mergeStateStatus:'CLEAN',reviewDecision:'APPROVED',statusCheckRollup:[{conclusion:'SUCCESS'}]});}
  assert.equal(args[0],'api');assert.equal(args[1],'graphql');pages++;return JSON.stringify(args.includes('after=next')?page([thread('late',false)],null):page([thread('early',true)],'next'));
 };
 const provider=new GitHubCLI(execute),pr=await provider.read('test/stack',1);assert.equal(pages,2);assert.equal(pr.reviewThreads?.unresolved,1);assert.equal(pr.headRef,'feature/a');
 moved=true;await assert.rejects(provider.read('test/stack',1),/PR_CHANGED_DURING_READ/);
});
