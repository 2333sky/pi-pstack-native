#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { digest, gates, git, readJSON, safePath, saveReport, scan, taskMarkdown, validateReport, writeConfined } from './core.mjs';

const root = realpathSync(process.cwd());
const argv = process.argv.slice(2), command = argv.shift() ?? 'scan', options = {};
const allowed = new Set(['from','candidate-ref','baseline-ref','report','write-report','worktree','allow-remote-write','repo']);
let temporary;
try {
  while (argv.length) {
    const flag = argv.shift();
    if (!flag.startsWith('--') || !allowed.has(flag.slice(2))) throw new Error('Unknown argument');
    const key = flag.slice(2);
    if (key === 'allow-remote-write') options[key] = true;
    else { const value = argv.shift(); if (!value || value.startsWith('--')) throw new Error('Missing argument value'); options[key] = value; }
  }
  if (command === 'scan') {
    const upstream = readJSON(join(root,'UPSTREAM.json'));
    let repo, candidateRef;
    if (options.from) {
      const input = realpathSync(resolve(options.from));
      repo = git(input,['rev-parse','--show-toplevel']).trim();
      if (input !== repo && input !== join(repo,'pstack')) throw new Error('--from must be repository root or pstack directory');
      candidateRef = options['candidate-ref'] ?? 'HEAD';
    } else {
      const ref = options['candidate-ref'] ?? 'main';
      if (ref !== 'main' && !/^[a-f0-9]{40}$/.test(ref)) throw new Error('Network candidate must be main or full SHA');
      temporary = mkdtempSync(join(tmpdir(),'pstack-upstream-'));
      repo = temporary;
      git(repo,['init','--bare']);
      git(repo,['fetch','--no-tags','https://github.com/cursor/plugins.git',ref]);
      candidateRef = git(repo,['rev-parse','FETCH_HEAD']).trim();
      git(repo,['fetch','--no-tags','https://github.com/cursor/plugins.git',options['baseline-ref'] ?? upstream.commit]);
    }
    const report = scan({repo,baselineRef:options['baseline-ref'] ?? upstream.commit,candidateRef,localRoot:root});
    const path = saveReport(root,report);
    if (options['write-report']) writeConfined(root,safePath(options['write-report']),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,syncId:report.syncId,report:path,changes:report.changes.length}));
    if (report.status === 'blocked') process.exitCode = 3;
  } else {
    const reportPath = safePath(options.report ?? '');
    const report = validateReport(readJSON(join(root,reportPath)));
    if (command === 'plan') {
      writeConfined(root,`docs/upstream-sync/tasks/${report.syncId}.md`,taskMarkdown(report));
      console.log(JSON.stringify({status:report.status,taskPackage:`docs/upstream-sync/tasks/${report.syncId}.md`}));
    } else if (command === 'verify') {
      const {fingerprint, sameFingerprint} = await import('../../src/artifacts/fingerprint.ts');
      const snapshot = fingerprint(root);
      const head = snapshot.commitSha;
      const tree = git(root,['status','--porcelain','--untracked-files=all']);
      const results = gates.map(name => {
        const r = spawnSync('npm',['run',name],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
        // Do not persist arbitrary provider/agent output or credentials. Only exit evidence.
        return {command:`npm run ${name}`,status:r.status === 0 ? 'passed':'failed',exitCode:r.status,signal:r.signal ?? null};
      });
      const current = fingerprint(root);
      const passed = results.every(g => g.status === 'passed') && sameFingerprint(snapshot,current);
      const evidence = {schemaVersion:1,syncId:report.syncId,reportFingerprint:report.fingerprint,localHead:head,candidateFingerprint:{workspaceDigest:snapshot.workspaceDigest,treeSha:snapshot.treeSha,indexTree:snapshot.indexTree,dirty:snapshot.dirty},sourceUnchanged:sameFingerprint(snapshot,current),workingTreeFingerprint:digest(tree),gates:results,liveE2E:'not_run',semanticReview:'not_run',status:passed && !report.impact.history_diverged ? 'verified':'blocked',integrated:false};
      writeConfined(root,`docs/upstream-sync/verification/${report.syncId}.json`,JSON.stringify(evidence,null,2)+'\n');
      console.log(JSON.stringify(evidence));
      if(evidence.status === 'blocked') process.exitCode = 3;
    } else if (command === 'prepare') {
      if(report.impact.history_diverged || report.status === 'no_change') throw new Error('Candidate cannot be proposed');
      const {fingerprint} = await import('../../src/artifacts/fingerprint.ts');
      fingerprint(root,'committed'); // Reuse native dirty/index-flag/submodule safety checks.
      const destination = resolve(options.worktree ?? join(dirname(root),`upstream-${report.syncId}`));
      if(existsSync(destination)) throw new Error('Worktree destination already exists');
      const branch = `upstream/${report.syncId}`;
      git(root,['worktree','add','-b',branch,destination,'HEAD']);
      writeConfined(destination,`docs/upstream-sync/tasks/${report.syncId}.md`,taskMarkdown(report));
      console.log(JSON.stringify({status:'prepared',branch,worktree:destination,prompt:`docs/upstream-sync/tasks/${report.syncId}.md`,agent:'manual/exported prompt; no provider or model dependency',baselineAdvanced:false}));
    } else if (command === 'propose') {
      if(report.impact.history_diverged || report.status === 'no_change') throw new Error('Candidate cannot be proposed');
      const {fingerprint} = await import('../../src/artifacts/fingerprint.ts');
      fingerprint(root,'committed');
      const branch = git(root,['branch','--show-current']).trim();
      if(branch !== `upstream/${report.syncId}` || git(root,['rev-parse','--git-dir']).trim() === '.git') throw new Error('Proposal requires prepared isolated worktree');
      if(git(root,['status','--porcelain','--untracked-files=all']).trim()) throw new Error('Commit candidate and verification evidence before proposing');
      const evidence = readJSON(join(root,`docs/upstream-sync/verification/${report.syncId}.json`));
      if(evidence.sourceUnchanged !== true || evidence.candidateFingerprint?.dirty !== false || evidence.reportFingerprint !== report.fingerprint || evidence.status !== 'verified' || evidence.gates.length !== gates.length || !gates.every(g => evidence.gates.some(e => e.command === `npm run ${g}` && e.status === 'passed'))) throw new Error('Required gate evidence missing');
      // Verification must belong to this candidate commit (evidence-only follow-up commits allowed).
      const head = git(root,['rev-parse','HEAD']).trim();
      git(root,['merge-base','--is-ancestor',evidence.localHead,head]);
      const changed = git(root,['diff','--name-only',evidence.localHead,head]).trim().split('\n').filter(Boolean);
      if(changed.some(p => !p.startsWith('docs/upstream-sync/verification/'))) throw new Error('Candidate changed since verification');
      if(evidence.workingTreeFingerprint !== digest('')) throw new Error('Verification requires committed clean candidate');
      const initial = git(root,['merge-base',head,'main']).trim();
      const protectedChanges = git(root,['diff','--name-only',initial,head,'--','UPSTREAM.json','PARITY.json']).trim();
      if(protectedChanges) throw new Error('Automatic proposal cannot advance baseline');
      const bodyPath = `docs/upstream-sync/pr-${report.syncId}.md`;
      const body = `## Why\nTrack and propose upstream ${report.candidate.sha}.\n\n## What changed\nCandidate semantic port; see task package ${report.syncId}.\n\n## Scope\nPending maintainer semantic review. Baseline remains unchanged.\n\n## Blast Radius\nHigh-risk seams and unresolved behavior are listed in the task package.\n\n## Verification\nRequired local gates passed. Live LLM/GitHub E2E: not_run. Semantic review: not_run. CI must independently pass.\n\n${taskMarkdown(report)}`;
      if(!options['allow-remote-write']) { console.log(JSON.stringify({status:'proposed',dryRun:true,branch,body,integrated:false})); }
      else {
        if(options.repo !== '2333sky/pi-pstack-native-2') throw new Error('Explicit approved target repository required');
        writeConfined(root,bodyPath,body);
        const gh = args => {try {return execFileSync('gh',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});} catch {throw new Error('GitHub operation failed; inspect remote state before retry');}};
        const existing = JSON.parse(gh(['pr','list','--repo',options.repo,'--head',branch,'--state','all','--json','url']));
        if(existing.length) console.log(JSON.stringify({status:'proposed',url:existing[0].url,reused:true}));
        else {
          // Push only this branch, without hooks, never merge or publish.
          git(root,['push',`https://github.com/${options.repo}.git`,`${head}:refs/heads/${branch}`]);
          const url = gh(['pr','create','--repo',options.repo,'--base','main','--head',branch,'--draft','--title',`Upstream candidate ${report.syncId}`,'--body-file',join(root,bodyPath)]).trim();
          console.log(JSON.stringify({status:'proposed',url,integrated:false}));
        }
      }
    } else throw new Error('Unknown command');
  }
} catch (error) {
  // Never include raw Git/npm/agent stderr, URLs, or environment in diagnostics.
  console.error(JSON.stringify({status:'error',message: error instanceof SyntaxError ? 'Invalid JSON input' : error.code ? `Local operation failed: ${error.code}` : String(error.message).split('\n')[0]}));
  process.exitCode = 2;
} finally { if(temporary) rmSync(temporary,{recursive:true,force:true}); }
