import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { hash, uid, transact, protocol } from '../runtime/protocol.ts';
import { redactSecrets } from '../runtime/redact.ts';
import type { Fingerprint, Artifact, BaselineOwner } from '../contracts/types.ts';
export function git(cwd: string, args: string[]): string { return execFileSync('git', ['-C', cwd, ...args], {encoding:'utf8', maxBuffer:64*1024*1024, timeout:30000}).trimEnd(); }
export function fingerprint(cwd: string, kind: 'working' | 'committed' = 'working'): Fingerprint {
  const root = realpathSync(git(cwd,['rev-parse','--show-toplevel']));
  const common = realpathSync(git(root,['rev-parse','--path-format=absolute','--git-common-dir']));
  const remote = redactSecrets(git(root,['remote','-v'])).split('\n').sort().join('\n');
  const repoId = hash({common, remote});
  const commitSha = git(root,['rev-parse','HEAD']); const treeSha = git(root,['rev-parse','HEAD^{tree}']);
  if (git(root,['ls-files','--stage']).split('\n').some(x=>x.startsWith('160000 '))) throw new Error('FINGERPRINT_UNSUPPORTED: submodules require separate artifacts');
  if (git(root,['ls-files','-v','-z']).split('\0').some(x=>x.startsWith('S ') || /^[a-z] /.test(x))) throw new Error('FINGERPRINT_INDEX_FLAGS_UNSUPPORTED');
  const files: Record<string,string> = {};
  const indexTree = git(root,['write-tree']); // Conflicted indexes fail closed.
  const paths = git(root,['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean).sort();
  for (const path of [...new Set(paths)]) {
    try {
      const absolute = join(root,path); const st = lstatSync(absolute);
      if (st.isSymbolicLink()) files[path] = hash({kind:'symlink', target:readlinkSync(absolute)});
      else if (st.isFile()) files[path] = hash({mode:st.mode & 0o111, bytes:hash(readFileSync(absolute).toString('base64'))});
      else throw new Error(`FINGERPRINT_UNSUPPORTED: ${path}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') files[path] = 'deleted'; else throw error; }
  }
  const dirty = Boolean(git(root,['status','--porcelain=v1','--untracked-files=all']));
  if (kind==='committed' && dirty) throw new Error('DIRTY_ARTIFACT: PR verification requires a clean checkout');
  return {repoId, kind, commitSha, treeSha, indexTree, files, dirty, workspaceDigest:hash({files,indexTree}), policyVersion:1};
}
export function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  return a.repoId===b.repoId && a.kind===b.kind && a.commitSha===b.commitSha && a.treeSha===b.treeSha && a.workspaceDigest===b.workspaceDigest && a.policyVersion===b.policyVersion;
}
type BaselineFingerprint = Fingerprint & { baselineId?: string };
type CapturePurpose = { kind: 'baseline'; owner: BaselineOwner } | { kind: 'verification'; baseline?: Fingerprint };
export function ownerOf(brief: { id: string; revision: number }, extra: { workflowId?: string; callKey?: string } = {}): BaselineOwner {
  return { briefId: brief.id, briefRevision: brief.revision, ...(extra.workflowId ? { workflowId: extra.workflowId } : {}), ...(extra.callKey ? { callKey: extra.callKey } : {}) };
}
function sameOwner(recorded: BaselineOwner | undefined, consumer: BaselineOwner | undefined): boolean {
  if (!recorded || !consumer) return false;
  if (recorded.briefId !== consumer.briefId || recorded.briefRevision !== consumer.briefRevision) return false;
  if (consumer.workflowId !== undefined || consumer.callKey !== undefined) return recorded.workflowId === consumer.workflowId && recorded.callKey === consumer.callKey;
  return recorded.workflowId === undefined && recorded.callKey === undefined;
}
export type BaselineResolution = { kind: 'ok'; fingerprint: Fingerprint } | { kind: 'unknown' } | { kind: 'unowned' };
export function resolveBaseline(before: Fingerprint, consumer?: BaselineOwner): BaselineResolution {
  const id = (before as BaselineFingerprint).baselineId;
  const artifact = typeof id==='string' ? protocol().artifacts[id] : undefined;
  if (!artifact || (artifact.fingerprint as BaselineFingerprint).baselineId!==artifact.id || hash(artifact.fingerprint)!==hash(before)) return {kind:'unknown'};
  return sameOwner(artifact.owner, consumer) ? {kind:'ok', fingerprint:artifact.fingerprint} : {kind:'unowned'};
}
export function capture(cwd: string, producer: string | undefined, parents: string[], kind: 'working' | 'committed', purpose: CapturePurpose): Artifact {
  const id = uid('art'); const fp: BaselineFingerprint = fingerprint(cwd,kind);
  const baselineId = purpose.kind==='baseline' ? id : (purpose.baseline as BaselineFingerprint | undefined)?.baselineId;
  if (baselineId) fp.baselineId = baselineId;
  const artifact: Artifact = {id,cwd:realpathSync(cwd),fingerprint:fp,parents,producer,...(purpose.kind==='baseline' ? {owner:purpose.owner} : {}),createdAt:new Date().toISOString()};
  transact('artifact-captured',artifact.id,'runtime',s=>{s.artifacts[artifact.id]=artifact; return artifact;}); return artifact;
}
