import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { capture, fingerprint, ownerOf, sameFingerprint, git } from '../src/artifacts/fingerprint.ts';
import { validateBrief, scopeViolations, matchPath, saveBrief, briefPrompt, parseReport } from '../src/contracts/brief.ts';
import { verify, ledgerCurrent, parseTestReport } from '../src/verification/runner.ts';
import { protocol, hash, transact } from '../src/runtime/protocol.ts';
import { refresh, eligibility, ship, authorizeMerge } from '../src/delivery/frontier.ts';
import { buildTemplate } from '../src/templates/build.ts';
import { claimLease, renewLease, assertLease } from '../src/runner/lease.ts';
import { WorkflowEngine } from '../src/workflow/engine.ts';
import { ProgramCoordinator } from '../src/program/coordinator.ts';
import { contextSnapshot } from '../src/context/snapshot.ts';
import { migrate } from '../src/runtime/migrate.ts';
import { homePath } from '../src/runtime/home.ts';
import { writeJsonAtomic } from '../src/runtime/store.ts';
import type { TaskBrief, GateSpec } from '../src/contracts/types.ts';
import type { PullRequest } from '../src/delivery/provider.ts';
function fixture(){
  const root=mkdtempSync(join(process.cwd(),'.test-protocol-'));const repo=join(root,'repo');mkdirSync(repo);
  process.env.PSTACK_NATIVE_HOME=join(root,'state');
  git(repo,['init','-q']);git(repo,['config','user.name','Test']);git(repo,['config','user.email','test@example.invalid']);
  writeFileSync(join(repo,'source.txt'),'baseline');writeFileSync(join(repo,'.gitignore'),'cache/\n');git(repo,['add','.']);git(repo,['commit','-qm','baseline']);
  return {root,repo,cleanup(){rmSync(root,{recursive:true,force:true});delete process.env.PSTACK_NATIVE_HOME;}};
}
function brief(repo:string,gates?:GateSpec[]):TaskBrief {
  const verification=gates ?? [{id:'file',kind:'file',path:'source.txt',pattern:'baseline',category:'typecheck'}];
  return {id:'brief',revision:1,contractLevel:'strict',goal:'Check source',scope:{repoId:fingerprint(repo).repoId,include:['**'],exclude:['private/**']},contextRefs:[],acceptance:[{id:'ac',description:'source valid',required:true,gateIds:verification.map(g=>g.id)}],verification,forbidden:['remote-write'],standingOrders:['preserve user changes'],reportFormat:'task-report-v1',timeboxSeconds:30};
}
const pass=['node','-e','console.log("ok")'];
function commandBrief(repo:string,command=pass){return brief(repo,[{id:'test',kind:'command',command,sideEffect:'none',category:'behavior',timeoutSeconds:2}]);}
const BRIEF_OWNER={id:'brief',revision:1};
function baseline(repo:string,own=BRIEF_OWNER){return capture(repo,undefined,[],'working',{kind:'baseline',owner:ownerOf(own)}).fingerprint;}
function agentBaseline(spec:any){return capture(spec.cwd,undefined,[],'working',{kind:'baseline',owner:ownerOf(spec.brief ?? BRIEF_OWNER,{workflowId:spec.workflowId,callKey:spec.callKey})}).fingerprint;}

test('strict brief validates required acceptance, commands and immutable revisions',()=>{const f=fixture();try{const b=brief(f.repo);validateBrief(b);assert.throws(()=>validateBrief({...b,acceptance:[]}),/BRIEF_INCOMPLETE/);assert.throws(()=>validateBrief({...b,timeboxSeconds:undefined}),/timebox/);saveBrief(b,'test','initial');saveBrief(b,'test','same');assert.equal(protocol().briefs.brief.length,1);assert.throws(()=>saveBrief({...b,goal:'new'},'test','update'),/REVISION/);saveBrief({...b,revision:2,goal:'new'},'test','update');assert.equal(protocol().briefs.brief.length,2);}finally{f.cleanup();}});
test('task brief describes the accepted report and its specialized fields',()=>{const f=fixture();try{const b=brief(f.repo);b.reportRequirements={kind:'review'};const prompt=briefPrompt(b);assert.match(prompt,/exactly one of completed, failed, or blocked/);assert.match(prompt,/findings:/);const fp=fingerprint(f.repo);const report={status:'completed',base:fp.commitSha,head:fp.commitSha,artifactRefs:[],commandsRun:[],evidenceRefs:[],deviations:[],unresolved:[],nextActions:[],findings:[]};assert.deepEqual(parseReport('```json\n'+JSON.stringify(report)+'\n```'),report);assert.throws(()=>parseReport(JSON.stringify({...report,status:'success'})),/TASK_REPORT_INCOMPLETE/);}finally{f.cleanup();}});
test('workflow exposes the blocked command policy reason',async()=>{const f=fixture();try{const engine=new WorkflowEngine({} as any);const b=commandBrief(f.repo);const wf=engine.create({cwd:f.repo,contractLevel:'strict',nodes:[{key:'task',task:'x',profile:'worker',brief:b}]});const before=capture(f.repo,undefined,[],'working',{kind:'baseline',owner:ownerOf(b,{workflowId:wf.id,callKey:'task'})}).fingerprint;const r={status:'completed',base:before.commitSha,head:before.commitSha,artifactRefs:[],commandsRun:[],evidenceRefs:[],deviations:[],unresolved:[],nextActions:[]};await engine.verifyCall(wf.id,'task',{id:'a',state:'completed',cwd:f.repo,baseline:before,report:r} as any);assert.equal(engine.get(wf.id)!.calls.task.verification?.reason,'COMMAND_NOT_ALLOWED');}finally{f.cleanup();}});
test('strict acceptance retains advisory notes and blocks legacy, blocking, malformed and short-SHA reports',async()=>{
 const f=fixture();try{
  const engine=new WorkflowEngine({} as any),b=brief(f.repo),wf=engine.create({cwd:f.repo,contractLevel:'strict',nodes:[{key:'task',task:'x',profile:'worker',brief:b}]});
  const before=capture(f.repo,undefined,[],'working',{kind:'baseline',owner:ownerOf(b,{workflowId:wf.id,callKey:'task'})}).fingerprint;
  const report={status:'completed',base:before.commitSha,head:before.commitSha,artifactRefs:[],commandsRun:[],evidenceRefs:[],deviations:[],unresolved:[],nextActions:[]};
  for(const [change,accepted] of [
   [{unresolved:[{severity:'advisory',description:'Documented trade-off'}],deviations:[{severity:'advisory',description:'Informational warning'}]},true],
   [{unresolved:['Legacy unresolved item']},false],
   [{deviations:[{severity:'blocking',description:'Acceptance is incomplete'}]},false],
   [{unresolved:[{severity:'advisory',description:'   '}]},false],
   [{deviations:[{severity:'unknown',description:'not classified'}]},false],
   [{base:before.commitSha.slice(0,7)},false],
  ] as const){
   const r={...report,...change};await engine.verifyCall(wf.id,'task',{id:'a',state:'completed',cwd:f.repo,baseline:before,report:r} as any);
   const v=engine.get(wf.id)!.calls.task.verification!;assert.equal(v.status,accepted?'passed':'blocked');
   assert.equal(protocol().ledgers[v.ledgerId!].contractAccepted,accepted);
   if(accepted)assert.deepEqual(engine.get(wf.id)!.calls.task.report!.unresolved,r.unresolved);
  }
  assert.match(briefPrompt(b),/40 hex characters for SHA-1 or 64 for SHA-256/);
  assert.throws(()=>parseReport(JSON.stringify({...report,unresolved:[{severity:'advisory',description:''}]})),/TASK_REPORT_INCOMPLETE/);
 }finally{f.cleanup();}
});
test('scope globs include root paths, deny excluded and traversal patterns',()=>{const f=fixture();try{assert(matchPath('a.ts','**/*.ts'));assert(matchPath('src/a/b.ts','src/**'));assert.deepEqual(scopeViolations(brief(f.repo),['private/a','src/a']),['private/a']);assert.throws(()=>validateBrief({...brief(f.repo),scope:{...brief(f.repo).scope,include:['../*']}}),/relativeGlob/);}finally{f.cleanup();}});
test('fingerprints distinguish staged, unstaged, untracked, mode and commits',()=>{const f=fixture();try{const a=fingerprint(f.repo);writeFileSync(join(f.repo,'source.txt'),'changed');const b=fingerprint(f.repo);assert(!sameFingerprint(a,b));git(f.repo,['add','.']);const c=fingerprint(f.repo);assert(!sameFingerprint(b,c));writeFileSync(join(f.repo,'other.txt'),'new');assert(!sameFingerprint(c,fingerprint(f.repo)));assert.throws(()=>fingerprint(f.repo,'committed'),/DIRTY/);git(f.repo,['add','.']);git(f.repo,['commit','-qm','new']);assert(!sameFingerprint(a,fingerprint(f.repo)));}finally{f.cleanup();}});
test('worktrees share repo identity while different repos never share it',()=>{const f=fixture();try{git(f.repo,['worktree','add','-qb','isolated',join(f.root,'wt')]);assert.equal(fingerprint(f.repo).repoId,fingerprint(join(f.root,'wt')).repoId);const other=join(f.root,'other');mkdirSync(other);git(f.repo,['clone','-q',f.repo,other]);assert.notEqual(fingerprint(f.repo).repoId,fingerprint(other).repoId);}finally{f.cleanup();}});
test('symlink fingerprints do not follow outside file contents',()=>{const f=fixture();try{writeFileSync(join(f.root,'outside'),'secret');symlinkSync(join(f.root,'outside'),join(f.repo,'link'));const a=fingerprint(f.repo);writeFileSync(join(f.root,'outside'),'different');assert(sameFingerprint(a,fingerprint(f.repo)));}finally{f.cleanup();}});
test('real runner passes and records log hashes; source or evidence changes invalidate',async()=>{const f=fixture();try{const before=baseline(f.repo);const l=await verify(f.repo,commandBrief(f.repo),{before,policy:{commands:[pass]}});assert.equal(l.status,'passed');assert.equal(l.verdict,'unit-test-verified');assert(ledgerCurrent(l,fingerprint(f.repo)));writeFileSync(protocol().evidence[l.evidenceRefs[0]].logPath,'tampered');assert(!ledgerCurrent(l,fingerprint(f.repo)));writeFileSync(join(f.repo,'source.txt'),'changed');assert(!ledgerCurrent(l,fingerprint(f.repo)));}finally{f.cleanup();}});
test('agent narrative cannot override failing deterministic command',async()=>{const f=fixture();try{const before=baseline(f.repo);const argv=['node','-e','process.exit(7)'];const l=await verify(f.repo,commandBrief(f.repo,argv),{before,policy:{commands:[argv]}});assert.equal(l.status,'failed');assert.equal(protocol().evidence[l.evidenceRefs[0]].exitCode,7);}finally{f.cleanup();}});
test('timeout, unknown side effects and unavailable executables are blocked',async()=>{const f=fixture();try{const before=baseline(f.repo);const argv=['node','-e','setInterval(()=>{},1000)'];const b=commandBrief(f.repo,argv);b.verification[0].timeoutSeconds=.05;assert.equal((await verify(f.repo,b,{before,policy:{commands:[argv]}})).status,'blocked');delete b.verification[0].sideEffect;assert.equal((await verify(f.repo,b,{before,policy:{commands:[argv]}})).status,'blocked');const missing=['no-such-pstack-command'];assert.equal((await verify(f.repo,commandBrief(f.repo,missing),{before,policy:{commands:[missing]}})).status,'blocked');}finally{f.cleanup();}});
test('shell chaining is never interpreted and command allowlist is exact',async()=>{const f=fixture();try{const before=baseline(f.repo);assert.equal((await verify(f.repo,commandBrief(f.repo),{before,policy:{commands:[]}})).status,'blocked');const cmd=['node','-e','console.log("x")',';','touch','oops'];assert.equal((await verify(f.repo,commandBrief(f.repo,cmd),{before,policy:{commands:[pass]}})).status,'blocked');}finally{f.cleanup();}});
test('test-time source mutation produces stale evidence, never verified',async()=>{const f=fixture();try{const before=baseline(f.repo);const argv=['node','-e','require("node:fs").writeFileSync("source.txt","mutation")'];assert.equal((await verify(f.repo,commandBrief(f.repo,argv),{before,policy:{commands:[argv]}})).status,'stale');}finally{f.cleanup();}});
test('scope and insufficient coverage reject acceptance',async()=>{const f=fixture();try{const before=baseline(f.repo);mkdirSync(join(f.repo,'private'));writeFileSync(join(f.repo,'private/a'),'bad');assert.equal((await verify(f.repo,brief(f.repo),{before})).status,'blocked');rmSync(join(f.repo,'private'),{recursive:true});writeFileSync(join(f.repo,'other'),'new');const b=brief(f.repo);b.verification[0].coverage=['source.txt'];assert.equal((await verify(f.repo,b,{before})).status,'blocked');}finally{f.cleanup();}});
test('human and advisory gates never auto-pass',async()=>{const f=fixture();try{const before=baseline(f.repo);const b=brief(f.repo,[{id:'human',kind:'human-approval'}]);assert.equal((await verify(f.repo,b,{before})).status,'blocked');assert.throws(()=>validateBrief(brief(f.repo,[{id:'judge',kind:'llm-review'}])),/machineGate/);}finally{f.cleanup();}});
test('JUnit and TAP reject malformed, skipped and failed runs',()=>{assert(parseTestReport('<testsuite tests="2" failures="0" errors="0"></testsuite>','junit'));assert(!parseTestReport('<testsuite tests="2"></testsuite>','junit'));assert(!parseTestReport('<testsuite tests="2" failures="1" errors="0"></testsuite>','junit'));assert(parseTestReport('ok 1 works\n1..1','tap'));assert(!parseTestReport('ok 1 # SKIP\n1..1','tap'));assert(!parseTestReport('ok 1\n1..2','tap'));});
test('evidence logs redact common credentials',async()=>{const f=fixture();try{const before=baseline(f.repo);const argv=['node','-e','console.log("token=verysecret password=hidden")'];const l=await verify(f.repo,commandBrief(f.repo,argv),{before,policy:{commands:[argv]}});assert.equal(l.status,'passed');const e=protocol().evidence[l.evidenceRefs[0]];assert.equal(e.exitCode,0);assert.equal(readFileSync(e.logPath,'utf8'),'token=[REDACTED] password=[REDACTED]\n');}finally{f.cleanup();}});
function report(fp:any){return {status:'completed' as const,base:fp.commitSha,head:fp.commitSha,artifactRefs:[],commandsRun:[],evidenceRefs:[],deviations:[],unresolved:[],nextActions:[]};}
const briefHistory=(id:string,key:string)=>Object.entries(protocol().briefs).filter(([briefId])=>briefId.endsWith(`.${id}.${key}`)).flatMap(([,versions])=>versions);
async function deliveryFixture(repo:string){
  const baseSha=git(repo,['rev-parse','HEAD']);
  writeFileSync(join(repo,'source.txt'),'baseline delivery');git(repo,['add','source.txt']);git(repo,['commit','-qm','delivery']);
  const fp=fingerprint(repo);const head=fp.commitSha;
  const spec={id:'stack',repoId:fp.repoId,repo:'example/project',numbers:[1,2,3],owner:'session',rootBase:'main'};
  const prs:PullRequest[]=[1,2,3].map((n,i)=>({number:n,repo:spec.repo,headSha:i===0?head:`head-${n}`,baseSha:i===0?baseSha:i===1?head:'head-2',baseRef:i?'branch-'+i:'main',state:'OPEN',draft:false,mergeState:'CLEAN',mergeable:'MERGEABLE',ci:'passed',review:'approved',reviewThreads:{status:'checked',total:0,unresolved:0,bugbotUnresolved:0}}));
  let merges=0;const provider={async read(_repo:string,n:number){return structuredClone(prs[n-1]);},async merge(p:PullRequest){assert.equal(p.headSha,prs[p.number-1].headSha);prs[p.number-1].state='MERGED';merges++;}};
  await verify(repo,commandBrief(repo),{policy:{commands:[pass]},pr:{repoId:fp.repoId,number:1,headSha:head,baseSha},report:{...report(fp),base:baseSha}});
  return {spec,prs,provider,merges:()=>merges};
}
test('stack frontier blocks upper PRs and ships only explicitly approved bottom PR',async()=>{const f=fixture();try{const d=await deliveryFixture(f.repo);const frontier=await refresh(d.spec,d.provider);const decisions=eligibility(frontier);assert.equal(decisions[0].eligible,true);assert(decisions[2].blockers.includes('LOWER_UNMERGED'));await ship(d.spec,d.provider);assert.equal(d.merges(),0);await assert.rejects(()=>ship(d.spec,d.provider,{dryRun:false}),/AUTHORIZATION/);const token=authorizeMerge(frontier,1,'human-cli');await ship(d.spec,d.provider,{token,dryRun:false});assert.equal(d.merges(),1);await assert.rejects(()=>ship(d.spec,d.provider,{token,dryRun:false}),/AUTHORIZATION/);}finally{f.cleanup();}});
test('changed PR head invalidates approval and old ledger',async()=>{const f=fixture();try{const d=await deliveryFixture(f.repo);const frontier=await refresh(d.spec,d.provider);const token=authorizeMerge(frontier,1,'human-cli');d.prs[0].headSha='new-head';d.prs[1].baseSha='new-head';await assert.rejects(()=>ship(d.spec,d.provider,{token,dryRun:false}),/AUTHORIZATION/);assert(eligibility(await refresh(d.spec,d.provider))[0].blockers.includes('CURRENT_VERIFICATION_REQUIRED'));assert.equal(d.merges(),0);}finally{f.cleanup();}});
test('TOCTOU change before merge blocks provider write',async()=>{const f=fixture();try{const d=await deliveryFixture(f.repo);const frontier=await refresh(d.spec,d.provider);const token=authorizeMerge(frontier,1,'human-cli');let reads=0;const provider={...d.provider,async read(repo:string,n:number){reads++;if(reads===4)d.prs[0].ci='failed';return d.provider.read(repo,n);}};await assert.rejects(()=>ship(d.spec,provider,{token,dryRun:false}),/FRONTIER_CHANGED/);assert.equal(d.merges(),0);}finally{f.cleanup();}});
test('typecheck-only and missing task report cannot satisfy behavior shipping',async()=>{const f=fixture();try{const d=await deliveryFixture(f.repo);transact('revoke','ledger','test',s=>{for(const id of Object.keys(s.ledgers))s.invalidations[id]={at:new Date().toISOString(),reason:'test'};});const typecheck=await verify(f.repo,brief(f.repo),{pr:{repoId:d.spec.repoId,number:1,headSha:d.prs[0].headSha,baseSha:d.prs[0].baseSha},report:{...report(fingerprint(f.repo)),base:d.prs[0].baseSha}});assert.equal(typecheck.status,'passed');assert.equal(typecheck.verdict,'type-check-only');assert.equal(typecheck.contractAccepted,true);assert.equal(eligibility(await refresh(d.spec,d.provider))[0].eligible,false);const missingReport=await verify(f.repo,commandBrief(f.repo),{policy:{commands:[pass]},pr:{repoId:d.spec.repoId,number:1,headSha:d.prs[0].headSha,baseSha:d.prs[0].baseSha}});assert.equal(missingReport.status,'passed');assert.equal(missingReport.verdict,'unit-test-verified');assert.equal(missingReport.contractAccepted,false);assert.equal(eligibility(await refresh(d.spec,d.provider))[0].eligible,false);}finally{f.cleanup();}});
for(const flag of ['--skip-worktree','--assume-unchanged']) {
  test(`round4 C ${flag} cannot turn a failed behavior gate into shipping evidence`,async()=>{
    const f=fixture();try {
      writeFileSync(join(f.repo,'forbidden.txt'),'baseline');git(f.repo,['add','.']);git(f.repo,['commit','-qm','forbidden baseline']);
      const fp=fingerprint(f.repo);
      const argv=['node','-e','process.exit(require("node:fs").readFileSync("forbidden.txt","utf8")==="hidden"?0:7)'];
      const b=commandBrief(f.repo,argv);b.scope.include=['source.txt'];
      const pr:PullRequest={repo:'example/project',number:1,headSha:fp.commitSha,baseSha:fp.commitSha,baseRef:'main',state:'OPEN',draft:false,mergeState:'CLEAN',mergeable:'MERGEABLE',ci:'passed',review:'approved',reviewThreads:{status:'checked',total:0,unresolved:0,bugbotUnresolved:0}};
      const provider={async read(){return structuredClone(pr);},async merge(){throw new Error('must not merge');}};
      const spec={id:'round4',repoId:fp.repoId,repo:pr.repo,numbers:[1],owner:'test',rootBase:'main'};
      const options={policy:{commands:[argv]},pr:{repoId:fp.repoId,number:1,headSha:fp.commitSha,baseSha:fp.commitSha},report:report(fp)};
      const failed=await verify(f.repo,b,options);
      assert.equal(failed.status,'failed');
      assert.equal(protocol().evidence[failed.evidenceRefs[0]].exitCode,7);
      assert.equal(eligibility(await refresh(spec,provider))[0].eligible,false);
      git(f.repo,['update-index',flag,'forbidden.txt']);writeFileSync(join(f.repo,'forbidden.txt'),'hidden');
      assert.equal(git(f.repo,['status','--porcelain=v1']),'');
      await assert.rejects(()=>verify(f.repo,b,options),{message:'FINGERPRINT_INDEX_FLAGS_UNSUPPORTED'});
      assert.equal(eligibility(await refresh(spec,provider))[0].eligible,false);
      assert.equal(Object.values(protocol().ledgers).filter(l=>l.status==='passed').length,0);
    }finally{f.cleanup();}
  });
}
test('PR repo/number/head evidence never crosses identity',async()=>{const f=fixture();try{const d=await deliveryFixture(f.repo);const wrong={...d.spec,id:'other-stack',repoId:'other-repo'};assert.equal(eligibility(await refresh(wrong,d.provider))[0].eligible,false);}finally{f.cleanup();}});
test('arena/race templates enforce rubric and model independence',()=>{const f=fixture();try{const b=brief(f.repo);assert.throws(()=>buildTemplate({kind:'arena',brief:b,models:['p/a','p/b'],judgeModel:'p/j'}),/RUBRIC/);assert.throws(()=>buildTemplate({kind:'arena',brief:b,models:['p/a','p/b'],judgeModel:'p/a',rubric:[{criterion:'correct',weight:1}]}),/INDEPENDENT/);const plan=buildTemplate({kind:'arena',brief:b,models:['p/a','p/b'],judgeModel:'p/j',rubric:[{criterion:'correct',weight:1}]});assert.equal(plan.nodes.filter(n=>n.profile==='worker').length,2);assert.equal(plan.nodes.at(-1)?.profile,'verifier');assert.equal(plan.nodes.find(n=>n.key==='integrate')?.profile,'integrator');}finally{f.cleanup();}});
test('review and partition templates encode readonly and explicit slices',()=>{const f=fixture();try{const b=brief(f.repo);const plan=buildTemplate({kind:'review',brief:b,models:['p/a','p/b']});assert(plan.nodes.every(n=>n.isolation==='readonly'));assert.throws(()=>buildTemplate({kind:'swarm',swarmMode:'partition',brief:b,models:['p/a']}),/SLICES/);assert.throws(()=>buildTemplate({kind:'arena',brief:b,models:['p/a','p/b'],judgeModel:'q/j',independencePolicy:'different-family',rubric:[{criterion:'correct',weight:1}]}),/UNPROVEN/);}finally{f.cleanup();}});
test('lease tokens fence stale workers after expiration and takeover',()=>{const f=fixture();try{const l=claimLease('wf','one');assert.throws(()=>claimLease('wf','two'),/BUSY/);transact('expire','wf','test',s=>{s.leases.wf.expiresAt=0;});const next=claimLease('wf','two');assert(next.token>l.token);assert.throws(()=>renewLease(l),/LOST/);assert.throws(()=>assertLease(l),/LOST/);assertLease(next);}finally{f.cleanup();}});
test('legacy migration backs up state, preserves ids and never fabricates verification',()=>{const f=fixture();try{writeJsonAtomic(homePath('workflows','legacy.json'),{id:'legacy',calls:{},state:'completed'});assert(migrate().records[0].needsMigration);assert.equal(JSON.parse(readFileSync(homePath('workflows','legacy.json'),'utf8')).schemaVersion,undefined);const r=migrate(false);assert(r.backup);assert.equal(JSON.parse(readFileSync(homePath('workflows','legacy.json'),'utf8')).verification,'unknown');assert.equal(JSON.parse(readFileSync(join(r.backup!,'legacy.json'),'utf8')).schemaVersion,undefined);}finally{f.cleanup();}});
test('strict workflow runs real gates, blocks malformed reports and invalidates current status',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();let malformed=false;
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){const baseline=agentBaseline(spec);const a={...spec,id:spec.id,state:'completed',cwd:spec.cwd,baseline,report:malformed?undefined:report(baseline),result:'done'};agents.set(a.id,a);return a;},async recover(a:any){return a;},async stop(id:string){return {...agents.get(id),state:'cancelled'};}};
  const engine=new WorkflowEngine(host);const ctx:any={sessionManager:{getSessionId:()=> 'session'},cwd:f.repo};
  const wf=engine.create({cwd:f.repo,parentSessionId:'session',contractLevel:'strict',nodes:[{key:'a',task:'check',profile:'verifier',brief:brief(f.repo)}]});
  const done=await engine.run(wf.id,ctx);assert.equal(done.state,'completed');assert.equal(done.verification,'verified');assert(engine.accepted(done.calls.a));
  writeFileSync(join(f.repo,'source.txt'),'changed');assert(!engine.accepted(done.calls.a));const snapshot=contextSnapshot(engine,'session');assert.equal(snapshot.workflows[0].calls[0].acceptance,'stale');
  writeFileSync(join(f.repo,'source.txt'),'baseline');malformed=true;const bad=engine.create({cwd:f.repo,nodes:[{key:'bad',task:'check',profile:'verifier',brief:brief(f.repo)}]});assert.equal((await engine.run(bad.id,ctx)).state,'blocked');
}catch(e){throw e;}finally{f.cleanup();}});
test('new strict mode rejects omitted contract before dispatch',()=>{const f=fixture();try{const e=new WorkflowEngine({} as any);assert.throws(()=>e.create({cwd:f.repo,contractLevel:'strict',nodes:[{key:'a',task:'x'}]}),/BRIEF_INCOMPLETE/);assert.equal(protocol().events.length,0);}finally{f.cleanup();}});
test('program pilot then rolling window clears 12 units and closes from Store',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();let running=0,peak=0;
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,spec.callKey==='slow'?50:5));const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);running--;return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',Array.from({length:12},(_,i)=>({key:'unit'+i,spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:{...brief(f.repo),id:'unit'+i}}]}})),3);
  await coordinator.run(p.id,ctx);assert(peak>1 && peak<=3);assert.equal(coordinator.get(p.id,'session').units.filter(u=>u.state==='reconciled').length,12);
  const restored=new ProgramCoordinator(engine);assert.equal(restored.close(p.id,'session').state,'completed');assert.throws(()=>restored.get(p.id,'other'),/NOT_FOUND/);
}finally{f.cleanup();}});
test('corrupt protocol Store fails closed instead of producing empty evidence',()=>{const f=fixture();try{mkdirSync(homePath(),{recursive:true});writeFileSync(homePath('protocol.json'),'{broken');assert.throws(()=>protocol());}finally{f.cleanup();}});
test('crash after gate-start leaves no passed ledger; restart verifies anew',async()=>{const f=fixture();try{
  const crashBrief={...brief(f.repo),id:'crash-brief'};
  const before=baseline(f.repo,crashBrief);
  const {spawn}=await import('node:child_process');
  const child=spawn(process.execPath,['test/fixtures/verification-crash-worker.mjs',f.repo,JSON.stringify(before)],{cwd:process.cwd(),env:process.env,stdio:'ignore'});
  await new Promise<void>((resolve,reject)=>{const deadline=Date.now()+5000;const timer=setInterval(()=>{try{if(Object.values(protocol().evidence).some(e=>e.status==='running')){clearInterval(timer);resolve();}else if(Date.now()>deadline){clearInterval(timer);reject(new Error('worker never reached gate'));}}catch{}},20);});
  child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));
  assert.equal(Object.values(protocol().ledgers).filter(l=>l.status==='passed').length,0);
  assert(Object.values(protocol().evidence).some(e=>e.status==='running'));
  const again=await verify(f.repo,crashBrief,{before});assert.equal(again.status,'passed');
}finally{f.cleanup();}});
test('crash after remote merge request consumes authorization; reconcile reads remote',async()=>{const f=fixture();try{
  const d=await deliveryFixture(f.repo);const frontier=await refresh(d.spec,d.provider);const token=authorizeMerge(frontier,1,'human-cli');
  const provider={...d.provider,async merge(p:PullRequest){await d.provider.merge(p);throw new Error('injected local crash after remote success');}};
  await assert.rejects(()=>ship(d.spec,provider,{token,dryRun:false}),/injected/);assert.equal(d.merges(),1);
  const recovered=await refresh(d.spec,d.provider);assert.equal(recovered.prs[0].state,'MERGED');
  await assert.rejects(()=>ship(d.spec,d.provider,{token,dryRun:false}),/AUTHORIZATION/);assert.equal(d.merges(),1);
}finally{f.cleanup();}});
test('strict budgets reject invalid values and stop future dispatch',async()=>{const f=fixture();try{
 const engine=new WorkflowEngine({run(){throw new Error('must not dispatch');},get(){return undefined;},stop(){throw new Error('no');},recover(){throw new Error('no');}} as any);
 assert.throws(()=>engine.create({cwd:f.repo,budget:{maxTokens:-1},nodes:[{key:'a',task:'x'}]}),/INVALID_BUDGET/);
 const w=engine.create({cwd:f.repo,budget:{maxTimeSeconds:.0001},nodes:[{key:'a',task:'x'}]});
 const done=await engine.run(w.id,{} as any);assert.equal(done.state,'blocked');assert.equal(done.calls.a.attempt,0);
}finally{f.cleanup();}});
test('structured evaluator reports cannot omit scores, evidence or selection',async()=>{const f=fixture();try{const {reportSatisfies}=await import('../src/contracts/brief.ts');const b={...brief(f.repo),reportRequirements:{kind:'evaluation' as const,criteria:['correct']}};const r=report(fingerprint(f.repo));assert(!reportSatisfies(b,r));assert(reportSatisfies(b,{...r,evaluation:[{criterion:'correct',score:8,evidence:['source.txt:1'],weaknesses:[],selectedParts:[]}]}));assert(!reportSatisfies(b,{...r,evaluation:[{criterion:'correct',score:8,evidence:[],weaknesses:[],selectedParts:[]}]}));}finally{f.cleanup();}});
test('program pause/resume and versioned orders persist for subsequent dispatch',()=>{const f=fixture();try{const e=new WorkflowEngine({} as any);const c=new ProgramCoordinator(e);const p=c.create('session',[{key:'unit',spec:{cwd:f.repo,nodes:[{key:'a',task:'x',brief:brief(f.repo)}]}}]);c.updateOrders(p.id,'session',['new rule'],'user update');assert.equal(c.get(p.id,'session').orders?.revision,1);c.pause(p.id,'session');assert.equal(c.resume(p.id,'session').state,'pilot');assert.equal(new ProgramCoordinator(e).get(p.id,'session').orders?.instructions[0],'new rule');}finally{f.cleanup();}});
test('tampered standing orders digest blocks dispatch and creates no workflow',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',[{key:'unit',spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:brief(f.repo)}]}}]);
  coordinator.updateOrders(p.id,'session',['ordered rule'],'operator update');
  transact('orders-tampered','program','test',s=>{s.programs[p.id].orders.instructions=['TAMPERED RULE'];});
  await assert.rejects(()=>coordinator.run(p.id,ctx),/ORDERS_INTEGRITY_MISMATCH/);
  assert.equal(coordinator.get(p.id,'session').units[0].workflowId,undefined);
  assert.equal(engine.list().length,0);
  assert(!protocol().events.some(e=>e.type==='unit-dispatched'));
}finally{f.cleanup();}});
test('restored coordinator stamps each unit with the orders revision in force at dispatch',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();let paused=false;
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);if(spec.brief?.id.endsWith('.unit1') && !paused){paused=true;coordinator.pause(p.id,'session');coordinator.updateOrders(p.id,'session',['new rule'],'operator update');}return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',['unit0','unit1','unit2'].map(key=>({key,spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:{...brief(f.repo),id:key}}]}})),1);
  coordinator.updateOrders(p.id,'session',['old rule'],'operator update');
  await coordinator.run(p.id,ctx);
  assert.equal(coordinator.get(p.id,'session').state,'paused');
  assert.deepEqual(coordinator.get(p.id,'session').units.map(u=>u.ordersRevision),[1,1,undefined]);
  const restored=new ProgramCoordinator(engine);
  assert.deepEqual(restored.get(p.id,'session').orders?.instructions,['new rule']);
  assert.equal(restored.resume(p.id,'session').state,'scaling');
  const stalled=await restored.run(p.id,ctx);
  assert.equal(stalled.state,'blocked');
  assert.deepEqual(stalled.units.map(u=>u.ordersRevision),[1,1,undefined]);
  assert.deepEqual(stalled.blockedReason?.units,[{key:'unit0',dispatchedRevision:1},{key:'unit1',dispatchedRevision:1}]);
  for(const key of ['unit0','unit1'])restored.acknowledgeOrders(p.id,'session',key,2,'operator ack');
  assert.equal(restored.resume(p.id,'session').state,'scaling');
  await restored.run(p.id,ctx);
  const after=restored.get(p.id,'session');
  assert.deepEqual(after.units.map(u=>u.ordersRevision),[1,1,2]);
  const ordersFor=(key:string)=>Object.entries(protocol().briefs).filter(([id])=>id.endsWith(`.${after.id}.${key}`)).flatMap(([,v])=>v).at(-1)?.standingOrders;
  assert.deepEqual(ordersFor('unit0'),['old rule']);
  assert.deepEqual(ordersFor('unit2'),['new rule']);
}finally{f.cleanup();}});
test('orders revised while a unit is running block the program until the operator acknowledges that revision',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();let runs=0;
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){runs++;const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);if(runs===1)coordinator.updateOrders(p.id,'session',['new safety rule'],'operator update');return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',[{key:'unit',spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:{...brief(f.repo),id:'unit'}}]}}]);
  coordinator.updateOrders(p.id,'session',['old rule'],'operator update');
  const blocked=await coordinator.run(p.id,ctx);
  assert.equal(blocked.state,'blocked');
  assert.equal(blocked.blockedReason?.code,'ORDERS_STALE');
  assert.deepEqual(blocked.blockedReason?.units,[{key:'unit',dispatchedRevision:1}]);
  assert.equal(blocked.blockedReason?.currentRevision,2);
  assert.match(blocked.blockedReason!.message,/dispatched under orders revision 1/);
  assert.match(blocked.blockedReason!.message,/current revision 2/);
  assert.equal(runs,1);
  assert.equal(engine.list().length,1);
  assert.equal(briefHistory(p.id,'unit').length,1);
}finally{f.cleanup();}});
test('orders acknowledgement is durable per unit, version stamped, and not implied by resume',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();let runs=0;
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){runs++;const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',[{key:'unit',spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:{...brief(f.repo),id:'unit'}}]}}]);
  coordinator.updateOrders(p.id,'session',['old rule'],'operator update');
  await coordinator.run(p.id,ctx);
  coordinator.updateOrders(p.id,'session',['new safety rule'],'operator update');
  assert.equal((await coordinator.run(p.id,ctx)).state,'blocked');
  const resumed=coordinator.resume(p.id,'session');
  assert.equal(resumed.state,'scaling');
  assert.deepEqual(resumed.staleUnits.map(d=>[d.key,d.dispatchedRevision,d.currentRevision]),[['unit',1,2]]);
  assert.equal((await coordinator.run(p.id,ctx)).state,'blocked');
  assert.throws(()=>coordinator.acknowledgeOrders(p.id,'session','unit',1,'operator ack'),/ORDERS_REVISION_MISMATCH/);
  assert.throws(()=>coordinator.acknowledgeOrders(p.id,'session','other',2,'operator ack'),/UNKNOWN_UNIT/);
  assert.equal(coordinator.acknowledgeOrders(p.id,'session','unit',2,'operator ack').units[0].ordersAcknowledgement?.revision,2);
  const restored=new ProgramCoordinator(engine);
  const ack=restored.get(p.id,'session').units[0].ordersAcknowledgement!;
  assert.deepEqual([ack.revision,ack.actor,ack.reason],[2,'session','operator ack']);
  assert.ok(Date.parse(ack.at)>0);
  const cleared=restored.resume(p.id,'session');
  assert.deepEqual(cleared.staleUnits,[]);
  assert.equal(cleared.state,'scaling');
  await restored.run(p.id,ctx);
  assert.equal(restored.get(p.id,'session').state,'scaling');
  assert.equal(runs,1);
  assert.equal(engine.list().length,1);
  assert.deepEqual(briefHistory(p.id,'unit').map(b=>b.standingOrders),[['old rule']]);
}finally{f.cleanup();}});
test('restarted coordinator never resumes a unit under superseded orders',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();let runs=0;
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){runs++;const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,result:'checked'};agents.set(a.id,a);return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',[{key:'unit',spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:{...brief(f.repo),id:'unit'}}]}}]);
  coordinator.updateOrders(p.id,'session',['old rule'],'operator update');
  const settled=await coordinator.run(p.id,ctx);
  assert.equal(settled.units[0].state,'blocked');
  const workflowId=settled.units[0].workflowId!;const ledgers=Object.keys(protocol().ledgers).length;
  coordinator.updateOrders(p.id,'session',['new safety rule'],'operator update');
  const restarted=new WorkflowEngine(host);const restored=new ProgramCoordinator(restarted);
  assert.equal(restarted.recoverSession('session',ctx).length,1);
  await new Promise(r=>setTimeout(r,50));
  assert.equal(restarted.get(workflowId)?.state,'blocked');
  assert.equal(restarted.get(workflowId)?.error?.code,'ORDERS_STALE');
  assert.match(restarted.get(workflowId)?.error?.message ?? '',/current revision 2/);
  assert.equal(Object.keys(protocol().ledgers).length,ledgers);
  assert.equal(runs,1);
  const blocked=await restored.run(p.id,ctx);
  assert.equal(blocked.state,'blocked');
  assert.deepEqual(blocked.blockedReason?.units,[{key:'unit',dispatchedRevision:1}]);
  assert.equal(blocked.blockedReason?.currentRevision,2);
}finally{f.cleanup();}});
test('a revised revision blocks only the units dispatched under the old one',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();let runs=0;
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){runs++;const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);if(runs===2)coordinator.updateOrders(p.id,'session',['revised rule'],'operator update');return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',['unit0','unit1','unit2','unit3'].map(key=>({key,spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:{...brief(f.repo),id:key}}]}})),1);
  coordinator.updateOrders(p.id,'session',['original rule'],'operator update');
  const blocked=await coordinator.run(p.id,ctx);
  assert.equal(blocked.state,'blocked');
  assert.deepEqual(blocked.blockedReason?.units.map(u=>u.key),['unit0','unit1']);
  assert.deepEqual(blocked.units.map(u=>u.ordersRevision),[1,1,undefined,undefined]);
  assert.equal(runs,2);
  coordinator.acknowledgeOrders(p.id,'session','unit0',2,'operator ack');
  assert.deepEqual((await coordinator.run(p.id,ctx)).blockedReason?.units.map(u=>u.key),['unit1']);
  assert.equal(runs,2);
  coordinator.acknowledgeOrders(p.id,'session','unit1',2,'operator ack');
  const finished=await coordinator.run(p.id,ctx);
  assert.equal(finished.units.filter(u=>u.state==='reconciled').length,4);
  assert.deepEqual(finished.units.map(u=>u.ordersRevision),[1,1,2,2]);
  assert.equal(runs,4);
  assert.deepEqual(finished.units.map(u=>briefHistory(p.id,u.key).length),[1,1,1,1]);
  assert.deepEqual(briefHistory(p.id,'unit0').map(b=>b.standingOrders),[['original rule']]);
  assert.deepEqual(briefHistory(p.id,'unit3').map(b=>b.standingOrders),[['revised rule']]);
}finally{f.cleanup();}});
test('orders digest tampered after the pilot refuses the next unit dispatch',async(t)=>{const f=fixture();try{
  const agents=new Map<string,any>();const started:string[]=[];
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){started.push(spec.brief.id);const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',['pilot','next'].map(key=>({key,spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:{...brief(f.repo),id:key}}]}})),1);
  coordinator.updateOrders(p.id,'session',['original rule'],'operator update');
  const run=engine.run.bind(engine);let pilotCompleted=false;
  t.mock.method(engine,'run',async(id:string,context:any)=>{const wf=await run(id,context);if(!pilotCompleted){assert.equal(wf.state,'completed');assert.equal(wf.verification,'verified');pilotCompleted=true;transact('test-orders-tampered',p.id,'test',s=>{s.programs[p.id].orders.instructions=['tampered rule'];});}return wf;});
  await assert.rejects(()=>coordinator.run(p.id,ctx),/ORDERS_INTEGRITY_MISMATCH/);
  const after=coordinator.get(p.id,'session');
  assert.equal(pilotCompleted,true);
  assert.equal(after.units[0].state,'ready-to-integrate');
  assert.equal(after.orders?.digest,hash(['original rule']));
  assert.deepEqual(after.orders?.instructions,['tampered rule']);
  assert.deepEqual(started,[`pilot.${p.id}.pilot`]);
  assert.equal(after.units[1].workflowId,undefined);
  assert.equal(engine.list().length,1);
  assert.deepEqual(briefHistory(p.id,'next'),[]);
}finally{t.mock.restoreAll();f.cleanup();}});
test('orders revised by the first root veto the second call in the same batch',async()=>{const f=fixture();try{
  const agents=new Map<string,any>();const started:{key:string;orders:string[]}[]=[];
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){started.push({key:spec.callKey,orders:spec.brief.standingOrders});if(spec.callKey==='first')coordinator.updateOrders(p.id,'session',['revised rule'],'operator update');const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',[{key:'unit',spec:{cwd:f.repo,maxConcurrency:2,nodes:['first','second'].map(key=>({key,profile:'scout',task:'inspect',brief:{...brief(f.repo),id:key}}))}}]);
  coordinator.updateOrders(p.id,'session',['original rule'],'operator update');
  const blocked=await coordinator.run(p.id,ctx);
  assert.deepEqual(started,[{key:'first',orders:['original rule']}]);
  assert.equal(blocked.state,'blocked');
  assert.equal(blocked.blockedReason?.currentRevision,2);
  const wf=engine.get(blocked.units[0].workflowId!)!;
  assert.equal(wf.state,'blocked');
  assert.equal(wf.error?.code,'ORDERS_STALE');
  assert.equal(wf.calls.first.state,'completed');
  assert.equal(wf.calls.second.attempt,0);
  assert.equal(wf.calls.second.agentId,undefined);
}finally{f.cleanup();}});
test('orders acknowledgement refuses a revision moved before transaction lock acquisition',async(t)=>{const f=fixture();try{
  const {FileLock}=await import('../src/runtime/lock.ts');const {lockPath}=await import('../src/runtime/home.ts');
  const agents=new Map<string,any>();
  const host:any={get:(id:string)=>agents.get(id),async run(spec:any){const fp=agentBaseline(spec);const a={...spec,state:'completed',cwd:spec.cwd,baseline:fp,report:report(fp),result:'checked'};agents.set(a.id,a);return a;}};
  const engine=new WorkflowEngine(host);const ctx:any={cwd:f.repo,sessionManager:{getSessionId:()=> 'session'}};const coordinator=new ProgramCoordinator(engine);
  const p=coordinator.create('session',[{key:'unit',spec:{cwd:f.repo,nodes:[{key:'read',profile:'scout',task:'inspect',brief:brief(f.repo)}]}}]);
  coordinator.updateOrders(p.id,'session',['original rule'],'operator update');
  assert.equal((await coordinator.run(p.id,ctx)).units[0].state,'reconciled');
  coordinator.updateOrders(p.id,'session',['second rule'],'operator update');
  const acquire=FileLock.prototype.acquire;let moved=false;
  t.mock.method(FileLock.prototype,'acquire',function(this:InstanceType<typeof FileLock>){if(!moved && this.path===lockPath('protocol-state')){moved=true;execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`import {ProgramCoordinator} from './src/program/coordinator.ts';new ProgramCoordinator(null).updateOrders(${JSON.stringify(p.id)},'session',['third rule'],'concurrent operator update');`],{cwd:process.cwd(),env:process.env});}return acquire.call(this);});
  assert.throws(()=>coordinator.acknowledgeOrders(p.id,'session','unit',2,'operator ack'),/ORDERS_REVISION_MISMATCH: acknowledgement names revision 2, current revision 3/);
  t.mock.restoreAll();
  const after=coordinator.get(p.id,'session');
  assert.equal(moved,true);
  assert.equal(after.orders?.revision,3);
  assert.deepEqual(after.orders?.instructions,['third rule']);
  assert.equal(after.units[0].ordersAcknowledgement,undefined);
  assert.equal(protocol().events.filter(e=>e.subject===p.id && e.type==='unit-orders-acknowledged').length,0);
  assert.equal(coordinator.acknowledgeOrders(p.id,'session','unit',3,'current operator ack').units[0].ordersAcknowledgement?.revision,3);
}finally{t.mock.restoreAll();f.cleanup();}});
