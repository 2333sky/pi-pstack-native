#!/usr/bin/env node
/** Opt-in, read-only real-model probe. No forge, workflow execution, filesystem mutation or shell tool. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgentSession, DefaultResourceLoader, ModelRegistry, SessionManager, getAgentDir } from '@earendil-works/pi-coding-agent';
import { createResourceTools } from '../../src/agent/resources.ts';
import { registerSemanticTool } from '../../src/compatibility/tool.ts';
const args=process.argv.slice(2);
if(args.length!==2 || args[0]!=='--model' || !/^[^/\s]+\/[^\s]+$/.test(args[1])) {
  console.error('usage: node --experimental-strip-types scripts/semantics/real-pi-smoke.mjs --model provider/model');process.exit(2);
}
const root=resolve('.'),cwd=mkdtempSync(join(tmpdir(),'pstack-semantic-real-'));
const tools=[createResourceTools(join(root,'skills'))[0]];
registerSemanticTool({registerTool:tool=>tools.push(tool)});
const agentDir=getAgentDir();
const loader=new DefaultResourceLoader({cwd,agentDir,noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true});
let session,timer;
try {
  await loader.reload();
  ({session}=await createAgentSession({cwd,agentDir,resourceLoader:loader,sessionManager:SessionManager.inMemory(),customTools:tools,tools:['pstack_skill','pstack_semantics'],thinkingLevel:'off'}));
  const registry=new ModelRegistry(session.modelRuntime),slash=args[1].indexOf('/');
  const model=registry.find(args[1].slice(0,slash),args[1].slice(slash+1));
  if(!model || !registry.hasConfiguredAuth(model)) {
    console.log(JSON.stringify({tier:'real-pi-real-model',status:'blocked',reason:'Requested model or configured authentication unavailable',model:args[1],inference:false}));process.exitCode=2;
  } else {
    await session.setModel(model);
    const observed=[],started=new Map();let modelError=false;
    session.subscribe(event=>{
      if(event.type==='tool_execution_start')started.set(event.toolCallId,event.args);
      if(event.type==='tool_execution_end')observed.push({tool:event.toolName,args:started.get(event.toolCallId),isError:event.isError,details:event.result?.details});
      if(event.type==='message_end' && event.message.role==='assistant' && event.message.stopReason==='error')modelError=true;
    });
    timer=setTimeout(()=>void session.abort(),90_000);
    await session.prompt('Read the entire pinned shipping playbook using pstack_skill resource upstream/skills/poteto-mode/playbooks/shipping.md. Continue every page until hasMore=false. Then call pstack_semantics action capability with name Cursor-watch-READY. Do not invent success for that unsupported operation. Finally call pstack_semantics action route name status. Return a short report. Use no other tools.');
    const reads=observed.filter(o=>o.tool==='pstack_skill' && !o.isError && o.details?.resource==='upstream/skills/poteto-mode/playbooks/shipping.md');
    const lines=new Set(reads.flatMap(o=>o.details.lines.map(l=>l.line)));
    const total=reads[0]?.details?.totalLines;
    const complete=total>0 && lines.size===total && reads.some(o=>o.details.hasMore===false);
    const refused=observed.some(o=>o.tool==='pstack_semantics' && o.args?.action==='capability' && o.args?.name==='Cursor-watch-READY' && o.isError);
    const routed=observed.some(o=>o.tool==='pstack_semantics' && o.details?.playbook==='babysit');
    const passed=complete && refused && routed && !modelError;
    console.log(JSON.stringify({tier:'real-pi-real-model',status:passed?'passed':'failed',model:args[1],completeSourceRead:complete,unsupportedRefused:refused,statusRoutedToBabysit:routed,inference:true,boundary:'One read-only shipping/source/capability/routing probe; no implementation, live surface, review swarm, merge or full behavioral parity.'},null,2));
    if(!passed)process.exitCode=1;
  }
} finally {clearTimeout(timer);session?.dispose();rmSync(cwd,{recursive:true,force:true});}
