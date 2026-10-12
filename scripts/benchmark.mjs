#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { WorkflowEngine } from '../dist/workflow/engine.js';
import { AgentHost } from '../dist/agent/host.js';
import { fingerprint } from '../dist/artifacts/fingerprint.js';
import { runnerOnce } from '../dist/runner/service.js';
const usage='benchmark requires explicit --agent-dir PATH --model provider/model';
export function parseArgs(argv){const value=key=>{const at=argv.indexOf(key);return at===-1?undefined:argv[at+1];};if(!argv.includes('--agent-dir')||!argv.includes('--model'))throw new Error(usage);const agentDir=value('--agent-dir');const model=value('--model');if(!agentDir||!model)throw new Error(usage);return{agentDir,model,output:value('--output')??'benchmark-output'};}
export function runnerBlocked(runnerResults=[]){return runnerResults.some(r=>r?.reason==='AUTHENTICATION_UNAVAILABLE');}
export function exitCode(rows,runnerResults=[]){if(runnerBlocked(runnerResults))return 1;return rows.length>0&&rows.every(r=>r.verified)?0:1;}
export async function runBenchmark({agentDir,model,output}) {
const root=resolve(output);mkdirSync(root,{recursive:true});
process.env.PSTACK_NATIVE_HOME=join(root,'state');mkdirSync(process.env.PSTACK_NATIVE_HOME,{recursive:true});
const cases=JSON.parse(readFileSync(new URL('../benchmarks/cases.json',import.meta.url),'utf8'));
const engine=new WorkflowEngine(new AgentHost());const rows=[];const runnerResults=[];
for(const c of cases) {
  const cwd=join(root,c.id);mkdirSync(cwd,{recursive:true});
  const source=`export function solve(${c.params}) { return ${c.seed}; }\n`;writeFileSync(join(cwd,'source.mjs'),source);
  writeFileSync(join(cwd,'checks.test.mjs'),`import {solve} from './source.mjs';\nimport assert from 'node:assert/strict';\n${c.assertions.map(a=>`assert.deepEqual(solve(${a.args}),${a.expected});`).join('\n')}\n`);
  const git=(...a)=>execFileSync('git',['-C',cwd,...a],{stdio:'ignore'});git('init','-q');git('config','user.name','Benchmark');git('config','user.email','benchmark@example.invalid');git('add','.');git('commit','-qm','fixture');
  const command=['node','--test','checks.test.mjs'];writeFileSync(join(process.env.PSTACK_NATIVE_HOME,'verification-policy.json'),JSON.stringify({commands:[command]}));
  const fp=fingerprint(cwd);
  const brief={id:c.id,revision:1,contractLevel:'strict',goal:c.goal,scope:{include:['source.mjs'],exclude:['checks.test.mjs'],repoId:fp.repoId},contextRefs:['checks.test.mjs'],acceptance:[{id:'behavior',description:c.goal,required:true,gateIds:['tests']}],verification:[{id:'tests',kind:'command',command,timeoutSeconds:30,sideEffect:'none',category:'behavior'}],timeboxSeconds:120,forbidden:['change tests','remote-write'],standingOrders:['Only change source.mjs; emit task-report-v1.'],reportFormat:'task-report-v1'};
  const wf=engine.create({cwd,parentSessionId:`benchmark-${c.id}`,contractLevel:'strict',budget:{maxTimeSeconds:180,maxTokens:20000},nodes:[{key:'fix',profile:'worker',task:c.goal,model,brief}]});
  runnerResults.push(...await runnerOnce({agentDir:resolve(agentDir),model,workflowIds:[wf.id]}));
  const result=engine.get(wf.id);rows.push({caseId:c.id,workflowId:wf.id,execution:result.state,verified:engine.acceptedWorkflow(result),usage:result.calls.fix.usage ?? null,error:result.error ?? null});
  writeFileSync(join(root,'results.json'),JSON.stringify({platform:'2333 Pi native',model,rows},null,2));
}
console.log(JSON.stringify({cases:rows.length,verified:rows.filter(r=>r.verified).length,results:join(root,'results.json')},null,2));
return {rows,runnerResults};
}
export function isEntry(argv1=process.argv[1]){if(!argv1)return false;const self=fileURLToPath(import.meta.url);if(argv1===self)return true;try{return realpathSync(argv1)===realpathSync(self);}catch{return false;}}
if(isEntry()){const {rows,runnerResults}=await runBenchmark(parseArgs(process.argv.slice(2)));const code=exitCode(rows,runnerResults);if(runnerBlocked(runnerResults))console.error('benchmark blocked: AUTHENTICATION_UNAVAILABLE');process.exit(code);}
