#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { WorkflowEngine } from '../dist/workflow/engine.js';
import { AgentHost } from '../dist/agent/host.js';
import { fingerprint } from '../dist/artifacts/fingerprint.js';
import { runnerOnce } from '../dist/runner/service.js';
const args=process.argv.slice(2);const value=key=>args[args.indexOf(key)+1];
if(!args.includes('--agent-dir') || !args.includes('--model'))throw new Error('benchmark requires explicit --agent-dir PATH --model provider/model');
const root=resolve(value('--output') ?? 'benchmark-output');mkdirSync(root,{recursive:true});
process.env.PSTACK_NATIVE_HOME=join(root,'state');mkdirSync(process.env.PSTACK_NATIVE_HOME,{recursive:true});
const cases=JSON.parse(readFileSync(new URL('../benchmarks/cases.json',import.meta.url),'utf8'));
const engine=new WorkflowEngine(new AgentHost());const rows=[];
for(const c of cases) {
  const cwd=join(root,c.id);mkdirSync(cwd,{recursive:true});
  const source=`export function solve(${c.params}) { return ${c.seed}; }\n`;writeFileSync(join(cwd,'source.mjs'),source);
  writeFileSync(join(cwd,'checks.test.mjs'),`import {solve} from './source.mjs';\nimport assert from 'node:assert/strict';\n${c.assertions.map(a=>`assert.deepEqual(solve(${a.args}),${a.expected});`).join('\n')}\n`);
  const git=(...a)=>execFileSync('git',['-C',cwd,...a],{stdio:'ignore'});git('init','-q');git('config','user.name','Benchmark');git('config','user.email','benchmark@example.invalid');git('add','.');git('commit','-qm','fixture');
  const command=['node','--test','checks.test.mjs'];writeFileSync(join(process.env.PSTACK_NATIVE_HOME,'verification-policy.json'),JSON.stringify({commands:[command]}));
  const fp=fingerprint(cwd);
  const brief={id:c.id,revision:1,contractLevel:'strict',goal:c.goal,scope:{include:['source.mjs'],exclude:['checks.test.mjs'],repoId:fp.repoId},contextRefs:['checks.test.mjs'],acceptance:[{id:'behavior',description:c.goal,required:true,gateIds:['tests']}],verification:[{id:'tests',kind:'command',command,timeoutSeconds:30,sideEffect:'none',category:'behavior'}],timeboxSeconds:120,forbidden:['change tests','remote-write'],standingOrders:['Only change source.mjs; emit task-report-v1.'],reportFormat:'task-report-v1'};
  const wf=engine.create({cwd,parentSessionId:`benchmark-${c.id}`,contractLevel:'strict',budget:{maxTimeSeconds:180,maxTokens:20000},nodes:[{key:'fix',profile:'worker',task:c.goal,model:value('--model'),brief}]});
  await runnerOnce({agentDir:resolve(value('--agent-dir')),model:value('--model'),workflowIds:[wf.id]});
  const result=engine.get(wf.id);rows.push({caseId:c.id,workflowId:wf.id,execution:result.state,verified:engine.acceptedWorkflow(result),usage:result.calls.fix.usage ?? null,error:result.error ?? null});
  writeFileSync(join(root,'results.json'),JSON.stringify({platform:'2333 Pi native',model:value('--model'),rows},null,2));
}
console.log(JSON.stringify({cases:rows.length,verified:rows.filter(r=>r.verified).length,results:join(root,'results.json')},null,2));
