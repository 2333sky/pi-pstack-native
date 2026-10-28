import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { capture, fingerprint, ownerOf } from '../src/artifacts/fingerprint.ts';
import { reportSatisfies } from '../src/contracts/brief.ts';
import { buildTemplate } from '../src/templates/build.ts';
import { WorkflowEngine } from '../src/workflow/engine.ts';
import { saveModels } from '../src/runtime/config.ts';

test('swarm first-pass waits for an accepted candidate and stops remaining sessions', async () => {
 const root=mkdtempSync(join(tmpdir(),'swarm-first-')), old=process.env.PSTACK_NATIVE_HOME;process.env.PSTACK_NATIVE_HOME=join(root,'home');
 const cwd=join(root,'repo');mkdirSync(cwd);const git=(...args:string[])=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
 git('init','-q');git('config','user.name','test');git('config','user.email','test@example.invalid');writeFileSync(join(cwd,'base.txt'),'base\n');git('add','.');git('commit','-qm','base');
 const model={provider:'p',id:'model',reasoning:true};const ctx:any={cwd,model,thinkingLevel:'off',scopedModels:[],modelRegistry:{find:()=>model,getAvailable:()=>[model]},sessionManager:{getSessionId:()=> 'parent'}};
 const brief:any={id:'first',revision:1,contractLevel:'strict',goal:'run candidate',scope:{repoId:fingerprint(cwd).repoId,include:['**'],exclude:[]},contextRefs:[],acceptance:[{id:'ok',description:'base exists',required:true,gateIds:['file']}],verification:[{id:'file',kind:'file',path:'base.txt',pattern:'base'}],forbidden:[],standingOrders:[],reportFormat:'task-report-v1',timeboxSeconds:30};
 const records=new Map<string,any>();let release:((value:any)=>void)|undefined;let stopped='';
 const host:any={get:(id:string)=>records.get(id),async run(spec:any){
   if(spec.callKey==='candidate-2'){const running={...spec,state:'running'};records.set(spec.id,running);return await new Promise(resolve=>{release=resolve;});}
   const base=capture(spec.cwd,undefined,[],'working',{kind:'baseline',owner:ownerOf(spec.brief,{workflowId:spec.workflowId,callKey:spec.callKey})}).fingerprint;
   const report={status:'completed',base:base.commitSha,head:base.commitSha,artifactRefs:[],commandsRun:[],evidenceRefs:[],deviations:[],unresolved:[],nextActions:[]};
   const done={...spec,state:'completed',baseline:base,report,result:'passed'};records.set(spec.id,done);return done;
 },async stop(id:string){stopped=id;const result={...records.get(id),state:'cancelled'};records.set(id,result);release?.(result);return result;}};
 try{
   saveModels({version:1,roles:{worker:'p/model'},thinkingLevel:'inherit-parent'});
   const plan=buildTemplate({kind:'swarm',swarmMode:'race',selectionPolicy:'first-pass',candidateCount:2,brief},ctx);
   const engine=new WorkflowEngine(host), created=engine.create({type:'swarm',completionPolicy:plan.completionPolicy,cwd,nodes:plan.nodes,parentSessionId:'parent'});
   const done=await engine.run(created.id,ctx);
   assert.equal(done.state,'completed');assert.equal(done.firstPassWinner,'candidate-1');assert.equal(done.verification,'verified');
   assert.equal(done.calls['candidate-2'].state,'cancelled');assert.equal(done.calls['candidate-2'].excludedFromSelection,true);assert.equal(stopped,done.calls['candidate-2'].agentId);
   assert.equal(done.calls['candidate-1'].verification?.status,'passed');
 }finally{if(old===undefined)delete process.env.PSTACK_NATIVE_HOME;else process.env.PSTACK_NATIVE_HOME=old;rmSync(root,{recursive:true,force:true});}
});

test('rank-all requires each candidate exactly once with a unique rank',()=>{
 const brief:any={reportRequirements:{kind:'ranking',candidates:['candidate-1','candidate-2']}};
 const ranking=[{candidate:'candidate-1',rank:1,reason:'simpler'},{candidate:'candidate-2',rank:2,reason:'more complex'}];
 assert(reportSatisfies(brief,{ranking} as any));
 assert.equal(reportSatisfies(brief,{ranking:ranking.slice(0,1)} as any),false);
 assert.equal(reportSatisfies(brief,{ranking:[ranking[0],{...ranking[1],rank:1}]} as any),false);
});

test('rank-all plans a complete comparison without integrating a winner',()=>{
 const brief:any={id:'rank',revision:1,contractLevel:'strict',goal:'compare candidates',scope:{repoId:'fixture',include:['**'],exclude:[]},contextRefs:[],acceptance:[{id:'ok',description:'ok',required:true,gateIds:['file']}],verification:[{id:'file',kind:'file',path:'base.txt'}],forbidden:[],standingOrders:[],reportFormat:'task-report-v1',timeboxSeconds:30};
 const plan=buildTemplate({kind:'swarm',swarmMode:'race',selectionPolicy:'rank-all',brief,models:['p/a','p/b'],judgeModel:'p/j',rubric:[{criterion:'correctness',weight:1}]});
 assert.equal(plan.nodes.find(n=>n.key==='rank')?.brief?.reportRequirements?.kind,'ranking');
 assert.equal(plan.nodes.some(n=>n.profile==='integrator'),false);
});
