import { fileURLToPath } from "node:url";
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { homePath, lockPath } from '../runtime/home.ts';
import { FileLock } from '../runtime/lock.ts';
import { hash, uid, transact, protocol } from '../runtime/protocol.ts';
import { fingerprint, capture, capturedBaseline, sameFingerprint, git } from '../artifacts/fingerprint.ts';
import { changedPaths, matchPath, scopeViolations, validateBrief, reportSatisfies } from '../contracts/brief.ts';
import type { GateSpec, GateStatus, TaskBrief, Evidence, Ledger, Fingerprint, TaskReport } from '../contracts/types.ts';
export interface RunnerPolicy { commands: string[][]; environment?: Record<string,string>; allowLocal?: boolean; allowRemote?: boolean; maxOutputBytes?: number; maxTimeoutSeconds?: number }
export function loadRunnerPolicy(): RunnerPolicy {
  try { return JSON.parse(readFileSync(homePath('verification-policy.json'),'utf8')); }
  catch { return {commands:[]}; }
}
function redact(s: string): string {
  return s.replace(/(authorization\s*[:=]\s*(?:bearer\s+)?|(?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,"'}]+/gi,'$1[REDACTED]').replace(/(https?:\/\/)[^\s/@]+@/gi,'$1[REDACTED]@').replace(/\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,})\b/g,'[REDACTED]');
}
function filePath(cwd: string, path: string): string {
  const base = realpathSync(cwd); const candidate = realpathSync(resolve(base,path)); const rel = relative(base,candidate);
  if (isAbsolute(path) || isAbsolute(rel) || rel==='..' || rel.startsWith('../')) throw new Error('Gate path escapes artifact');
  return candidate;
}
async function command(cwd: string, gate: GateSpec, policy: RunnerPolicy, signal?: AbortSignal): Promise<{status: GateStatus; exitCode?:number|null; log:string; reason?:string}> {
  if (!gate.command?.length || !policy.commands?.some(c=>JSON.stringify(c)===JSON.stringify(gate.command))) return {status:'blocked',log:'',reason:'COMMAND_NOT_ALLOWED'};
  if (!['none','local','remote'].includes(gate.sideEffect ?? '') || gate.sideEffect==='local' && !policy.allowLocal || gate.sideEffect==='remote' && !policy.allowRemote) return {status:'blocked',log:'',reason:'SIDE_EFFECT_NOT_AUTHORIZED'};
  if (signal?.aborted) return {status:'blocked',log:'',reason:'CANCELLED'};
  return new Promise(resolveResult=>{
    const duration=Math.max(1,Math.min(gate.timeoutSeconds ?? 120,policy.maxTimeoutSeconds ?? 300))*1000;
    const child = spawn(process.execPath,[fileURLToPath(new URL('./process.mjs',import.meta.url)),String(duration),...gate.command!], {cwd, shell:false, detached:process.platform!=='win32', env:{PATH:process.env.PATH ?? '', ...policy.environment}});
    let log=''; let reason: string|undefined;
    const cap = Math.max(1024, Math.min(policy.maxOutputBytes ?? 65536, 4*1024*1024));
    const collect = (b: Buffer) => { log=(log+b.toString('utf8')).slice(-cap); };
    child.stdout?.on('data',collect); child.stderr?.on('data',collect);
    const kill = (why: string) => { reason=why; try { if (process.platform!=='win32' && child.pid) process.kill(-child.pid,'SIGKILL'); else child.kill('SIGKILL'); } catch {} };
    const timer = setTimeout(()=>kill('TIMEOUT'), duration);
    const abort = ()=>kill('CANCELLED'); signal?.addEventListener('abort',abort,{once:true});
    const cleanup = ()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    child.on('error',error=>{cleanup(); resolveResult({status:'blocked',reason:'ENVIRONMENT_UNAVAILABLE',log:redact(error.message)});});
    child.on('close',code=>{cleanup();resolveResult({status:reason || code===124 || code===125 || code===127 ? 'blocked' : code===0 ? 'passed' : 'failed', exitCode:code,reason,log:redact(log)});});
  });
}
export function parseTestReport(text: string, format: 'junit'|'tap'): boolean {
  if (format==='tap') {
    const plan = text.match(/^1\.\.(\d+)\s*$/m); const tests = text.match(/^(?:not )?ok\s+\d+.*$/gm) ?? [];
    return Boolean(plan && Number(plan[1])>0 && tests.length===Number(plan[1]) && !/^not ok\b/m.test(text) && !/Bail out!/i.test(text) && !tests.some(t=>/#\s*(SKIP|TODO)/i.test(t)));
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Unsafe XML');
  const suites = [...text.matchAll(/<testsuite\b([^>]*)>/g)];
  if (!suites.length || !/<\/testsuite>/.test(text) || /<(failure|error|skipped)\b/.test(text)) return false;
  return suites.every(([,attrs])=>{
    const n=(key:string)=>{const m=attrs.match(new RegExp(`\\b${key}=["'](\\d+)["']`));return m?Number(m[1]):undefined;};
    return (n('tests') ?? 0)>0 && n('failures')===0 && n('errors')===0 && (n('skipped') ?? 0)===0;
  });
}
export function ledgerCurrent(entry: Ledger, current: Fingerprint): boolean {
  const state=protocol();
  return entry.status==='passed' && (!entry.pr || Boolean(entry.diffBase && (!entry.pr.baseSha || entry.diffBase.commitSha===entry.pr.baseSha))) && !state.invalidations[entry.id] && sameFingerprint(entry.fingerprint,current) && entry.evidenceRefs.length>0 && entry.evidenceRefs.every(id=>{
    const e=state.evidence[id]; if (!e || e.status!=='passed') return false;
    try { return hash(readFileSync(e.logPath,'utf8'))===e.checksum; } catch {return false;}
  });
}
export function invalidate(cwd: string, reason: string): string[] {
  const current=fingerprint(cwd);
  return transact('ledger-invalidation',current.repoId,'runtime',s=>{
    const ids=Object.values(s.ledgers).filter(e=>e.fingerprint.repoId===current.repoId && !sameFingerprint(e.fingerprint,current) && !s.invalidations[e.id]).map(e=>e.id);
    for(const id of ids)s.invalidations[id]={at:new Date().toISOString(),reason}; return ids;
  });
}
export async function verify(cwd: string, brief: TaskBrief, options: {policy?:RunnerPolicy; actor?:string; before?:Fingerprint; parents?:string[]; pr?:Ledger['pr']; signal?:AbortSignal; report?:TaskReport} = {}): Promise<Ledger> {
  const actor=options.actor ?? 'verification-runner';
  try {validateBrief(brief);} catch(error) {transact('verification-rejected',brief?.id ?? 'unknown',actor,()=>({reason:String(error)}));throw error;}
  const policy=options.policy ?? loadRunnerPolicy();
  const lock=new FileLock(lockPath(`verify-${hash(realpathSync(cwd))}`));
  const deadline=Date.now()+5000;
  while(!lock.acquire()) {
    if(Date.now()>=deadline || options.signal?.aborted)throw new Error('VERIFICATION_BUSY_OR_CANCELLED');
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  try {
    const baseline=options.before ? capturedBaseline(options.before) : undefined;
    const artifact=capture(cwd,undefined,options.parents,options.pr?'committed':'working',{kind:'verification',baseline});
    if(brief.scope.repoId!==artifact.fingerprint.repoId)throw new Error('REPOSITORY_MISMATCH');
    if(options.pr && (options.pr.repoId!==artifact.fingerprint.repoId || options.pr.headSha!==artifact.fingerprint.commitSha))throw new Error('PR_HEAD_MISMATCH');
    let paths:string[]=[];let diffBase:Ledger['diffBase'];let baselineError:string|undefined;
    try {
      if(options.pr?.baseSha) {
        const base=options.pr.baseSha;
        if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(base) || git(cwd,['rev-parse','--verify',`${base}^{commit}`])!==base)throw new Error('INVALID_DIFF_BASE');
        git(cwd,['merge-base','--is-ancestor',base,artifact.fingerprint.commitSha]);
        paths=git(cwd,['diff','--no-renames','--name-only','-z',base,artifact.fingerprint.commitSha]).split('\0').filter(Boolean);
        diffBase={kind:'pr',commitSha:base,refreshed:false};
      } else if(options.before) {
        const before=baseline;
        if(!before)throw new Error('DIFF_BASE_UNPROVEN');
        if(before.repoId!==artifact.fingerprint.repoId || before.policyVersion!==1 || !['working','committed'].includes(before.kind) || !before.files || typeof before.files!=='object' || Array.isArray(before.files) || !Object.values(before.files).every(value=>typeof value==='string') || before.workspaceDigest!==hash({files:before.files,indexTree:before.indexTree}) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(before.commitSha) || git(cwd,['rev-parse','--verify',`${before.commitSha}^{commit}`])!==before.commitSha)throw new Error('INVALID_DIFF_BASE');
        if(options.pr) {
          if(before.dirty!==false || before.treeSha!==before.indexTree || git(cwd,['rev-parse',`${before.commitSha}^{tree}`])!==before.treeSha)throw new Error('INVALID_DIFF_BASE');
          git(cwd,['merge-base','--is-ancestor',before.commitSha,artifact.fingerprint.commitSha]);
          paths=git(cwd,['diff','--no-renames','--name-only','-z',before.commitSha,artifact.fingerprint.commitSha]).split('\0').filter(Boolean);
        } else paths=changedPaths(before,artifact.fingerprint,cwd);
        diffBase={kind:'fingerprint',commitSha:before.commitSha,fingerprintHash:hash(before),refreshed:false};
      } else if(options.pr || brief.contractLevel==='strict')baselineError='DIFF_BASE_REQUIRED';
      else paths=[...new Set([...git(cwd,['diff','--no-renames','--name-only','-z','HEAD']).split('\0'),...git(cwd,['diff','--cached','--no-renames','--name-only','-z','HEAD']).split('\0'),...git(cwd,['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean))].sort();
    } catch(error) {baselineError=error instanceof Error && error.message==='DIFF_BASE_UNPROVEN'?'DIFF_BASE_UNPROVEN':'DIFF_BASE_UNAVAILABLE';}
    const baseKey=(base:Ledger['diffBase'])=>base?hash({kind:base.kind,commitSha:base.commitSha,fingerprintHash:base.fingerprintHash}):undefined;
    transact('verification-baseline',brief.id,actor,s=>{
      const old=Object.values(s.ledgers).filter(e=>e.fingerprint.repoId===artifact.fingerprint.repoId && (options.pr?e.pr?.number===options.pr.number && e.pr.repoId===options.pr.repoId:e.gateDefinitionHash===hash(brief) && !e.pr));
      if(diffBase)diffBase.refreshed=old.some(e=>baseKey(e.diffBase)!==baseKey(diffBase));
      for(const e of old)if(e.fingerprint.commitSha!==artifact.fingerprint.commitSha || baseKey(e.diffBase)!==baseKey(diffBase))s.invalidations[e.id]={at:new Date().toISOString(),reason:'DIFF_BASE_OR_HEAD_CHANGED'};
      return {diffBase,reason:baselineError};
    });
    const violations=scopeViolations(brief,paths);
    const requiredIds = new Set((brief.acceptance ?? []).filter(ac=>ac.required).flatMap(ac=>ac.gateIds));
    const results: Evidence[]=[]; const nonce=uid('exec');
    for(const gate of brief.verification) {
      const id=uid('ev'); const startedAt=new Date().toISOString();
      const logPath=homePath('evidence',`${id}.log`);
      let status:GateStatus='blocked'; let log=''; let reason:string|undefined; let exitCode:number|null|undefined;
      transact('gate-started',id,actor,s=>{s.evidence[id]={id,gateId:gate.id,gateDefinitionHash:hash(gate),status:'running',cwd,startedAt,finishedAt:startedAt,artifactId:artifact.id,logPath,checksum:'',actor,environmentHash:hash({node:process.version,platform:process.platform,policy})};return {id};});
      try {
        if(baselineError)reason=baselineError;
        else if(violations.length) {reason='SCOPE_VIOLATION';log=JSON.stringify(violations);}
        else if(gate.coverage && paths.some(p=>!gate.coverage!.some(g=>matchPath(p,g))))reason='INSUFFICIENT_COVERAGE';
        else if(gate.kind==='command' || gate.kind==='test-report' && gate.command) {
          const r=await command(cwd,gate,policy,options.signal);status=r.status;log=r.log;reason=r.reason;exitCode=r.exitCode;
          if(status==='passed' && gate.kind==='test-report')status=parseTestReport(readFileSync(filePath(cwd,gate.path!),'utf8'),gate.format!)?'passed':'failed';
        } else if(gate.kind==='file') {log=readFileSync(filePath(cwd,gate.path!),'utf8');status=!gate.pattern || new RegExp(gate.pattern).test(log)?'passed':'failed';}
        else if(gate.kind==='diff') {log=JSON.stringify(paths);status=paths.length<=(gate.maxFiles ?? Infinity)?'passed':'failed';}
        else if(gate.kind==='test-report') {log=readFileSync(filePath(cwd,gate.path!),'utf8');status=parseTestReport(log,gate.format!)?'passed':'failed';}
        else if(gate.kind==='human-approval') {const approval=protocol().approvals[hash({fingerprint:artifact.fingerprint,gate:hash(gate)})];status=approval?'passed':'blocked';reason=approval?undefined:'HUMAN_APPROVAL_REQUIRED';log=JSON.stringify(approval ?? {});}
        else {reason='ADVISORY_ONLY';}
      } catch(error) {status='blocked';reason='CHECK_UNAVAILABLE';log=String(error);}
      log=redact(log).slice(-Math.min(policy.maxOutputBytes ?? 65536,4*1024*1024));mkdirSync(dirname(logPath),{recursive:true});writeFileSync(logPath,log,{mode:0o600});
      const evidence:Evidence={id,gateId:gate.id,gateDefinitionHash:hash(gate),status,reason,command:gate.command,cwd,exitCode,startedAt,finishedAt:new Date().toISOString(),artifactId:artifact.id,logPath,checksum:hash(log),actor,environmentHash:hash({node:process.version,platform:process.platform,policy})};
      results.push(evidence);transact('gate-settled',id,actor,s=>{s.evidence[id]=evidence;return {id,status,reason};});
    }
    const required=results.filter(e=>brief.verification.find(g=>g.id===e.gateId)?.required!==false || requiredIds.has(e.gateId));
    let status:GateStatus = required.length===0 ? 'blocked' : required.some(e=>e.status==='failed')?'failed':required.some(e=>e.status!=='passed')?'blocked':'passed';
    if(baselineError || violations.length)status='blocked';
    try {if(!sameFingerprint(artifact.fingerprint,fingerprint(cwd,options.pr?'committed':'working')))status='stale';} catch {status='stale';}
    const categories=brief.verification.filter(g=>(g.required!==false || requiredIds.has(g.id)) && ['command','test-report'].includes(g.kind)).map(g=>g.category);
    const r=options.report;
    const contractAccepted=!baselineError && (brief.contractLevel==='minimal' || Boolean(r && r.status==='completed' && reportSatisfies(brief,r) && r.head===artifact.fingerprint.commitSha && r.base===(diffBase?.commitSha ?? artifact.fingerprint.commitSha) && !r.deviations.length && !r.unresolved.length));
    const ledger:Ledger={contractAccepted,id:uid('ver'),artifactId:artifact.id,fingerprint:artifact.fingerprint,evidenceRefs:required.map(e=>e.id),gateIds:required.map(e=>e.gateId),gateDefinitionHash:hash(brief),status,verdict:status==='passed'?(categories.includes('behavior')?'unit-test-verified':'type-check-only'):status==='failed'?'verifier-failed':status==='blocked'?'verifier-blocked':'not-verified',verifiedAt:new Date().toISOString(),verifiedBy:actor,executionNonce:nonce,diffBase,pr:options.pr};
    transact('verification-recorded',ledger.id,actor,s=>{s.ledgers[ledger.id]=ledger;return ledger;});return ledger;
  } catch(error) {transact('verification-rejected',brief.id,actor,()=>({reason:String(error)}));throw error;}
  finally {lock.release();}
}
