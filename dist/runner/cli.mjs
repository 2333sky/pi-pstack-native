#!/usr/bin/env node
import { auditWorktree } from '../worktree/manager.js';
import { prepareStack, openStack } from '../delivery/stack.js';
import { preparePR, openPreparedPR } from '../delivery/prepare.js';
// Node >=22.19 executes the shipped TypeScript sources natively.
import { readFileSync, writeFileSync } from 'node:fs';
import { runService } from './service.js';
import { migrate } from '../runtime/migrate.js';
import { protocol, hash, transact } from '../runtime/protocol.js';
import { fingerprint } from '../artifacts/fingerprint.js';
import { authorizeMerge, ship, refresh } from '../delivery/frontier.js';
import { GitHubCLI } from '../delivery/provider.js';
const [action,...args]=process.argv.slice(2);
try {
  if(action==='migrate')console.log(JSON.stringify(migrate(!args.includes('--apply')),null,2));
  else if(action==='run') {
    if(!args[0])throw new Error('run requires runner configuration JSON');
    const controller=new AbortController();process.on('SIGTERM',()=>controller.abort());process.on('SIGINT',()=>controller.abort());
    await runService(args[0],args.includes('--once'),controller.signal);
  } else if(action==='approve-gate') {
    const [cwd,briefPath,gateId]=args;const brief=JSON.parse(readFileSync(briefPath,'utf8'));const gate=brief.verification.find(g=>g.id===gateId);
    if(gate?.kind!=='human-approval' || !args.includes('--approve'))throw new Error('Requires human-approval gate and explicit --approve');
    const fp=fingerprint(cwd,args.includes('--committed')?'committed':'working');
    transact('human-gate-approved',gateId,'human-cli',s=>{s.approvals[hash({fingerprint:fp,gate:hash(gate)})]={actor:'human-cli',at:new Date().toISOString(),briefId:brief.id};return {gateId};});
    console.log('Human approval recorded for this exact fingerprint.');
  } else if(action==='worktree-audit') {
    const info=JSON.parse(readFileSync(args[0],'utf8'));console.log(JSON.stringify(await auditWorktree(info,args[1] ?? info.baseRef),null,2));
  } else if(action==='stack-plan') {
    const input=JSON.parse(readFileSync(args[0],'utf8'));const plan=await prepareStack(input,new GitHubCLI());
    if(args[1])writeFileSync(args[1],JSON.stringify(plan,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(plan,null,2));
  } else if(action==='stack-open') {
    const plan=JSON.parse(readFileSync(args[0],'utf8'));console.log(JSON.stringify(await openStack(plan,new GitHubCLI(),args.includes('--approve')),null,2));
  } else if(action==='ship') {
    const spec=JSON.parse(readFileSync(args[0],'utf8'));const provider=new GitHubCLI();
    if(!args.includes('--approve'))console.log(JSON.stringify(await ship(spec,provider),null,2));
    else {
      const n=Number(args[args.indexOf('--pr')+1]);const f=await refresh(spec,provider);const token=authorizeMerge(f,n,'human-cli');
      console.log(JSON.stringify(await ship(spec,provider,{token,dryRun:false}),null,2));
    }
  } else if(action==='open-pr') {
    const [cwd,ledgerId,detailsPath]=args;const details=JSON.parse(readFileSync(detailsPath,'utf8'));
    const plan=preparePR(cwd,ledgerId,details);console.log(JSON.stringify(await openPreparedPR(cwd,plan,new GitHubCLI(),args.includes('--approve')),null,2));
  } else if(action==='export') {writeFileSync(args[0],JSON.stringify(protocol(),null,2));console.log('Audit exported.');}
  else throw new Error('Usage: pstack-runner run CONFIG [--once] | migrate [--apply] | approve-gate CWD BRIEF GATE --approve [--committed] | worktree-audit INFO [BASE] | stack-plan INPUT [OUTPUT] | stack-open PLAN [--approve] | ship STACK [--approve --pr NUMBER] | export FILE');
} catch(error) {console.error(String(error));process.exitCode=1;}
