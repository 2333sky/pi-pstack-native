import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { hash, uid, transact, protocol } from "../runtime/protocol.js";
export function git(cwd, args) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000 }).trimEnd(); }
export function fingerprint(cwd, kind = 'working') {
    const root = realpathSync(git(cwd, ['rev-parse', '--show-toplevel']));
    const common = realpathSync(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
    const remote = git(root, ['remote', '-v']).split('\n').map(x => x.replace(/https?:\/\/[^/@]+@/g, 'https://')).sort().join('\n');
    const repoId = hash({ common, remote });
    const commitSha = git(root, ['rev-parse', 'HEAD']);
    const treeSha = git(root, ['rev-parse', 'HEAD^{tree}']);
    if (git(root, ['ls-files', '--stage']).split('\n').some(x => x.startsWith('160000 ')))
        throw new Error('FINGERPRINT_UNSUPPORTED: submodules require separate artifacts');
    if (git(root, ['ls-files', '-v', '-z']).split('\0').some(x => x.startsWith('S ') || /^[a-z] /.test(x)))
        throw new Error('FINGERPRINT_INDEX_FLAGS_UNSUPPORTED');
    const files = {};
    const indexTree = git(root, ['write-tree']); // Conflicted indexes fail closed.
    const paths = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean).sort();
    for (const path of [...new Set(paths)]) {
        try {
            const absolute = join(root, path);
            const st = lstatSync(absolute);
            if (st.isSymbolicLink())
                files[path] = hash({ kind: 'symlink', target: readlinkSync(absolute) });
            else if (st.isFile())
                files[path] = hash({ mode: st.mode & 0o111, bytes: hash(readFileSync(absolute).toString('base64')) });
            else
                throw new Error(`FINGERPRINT_UNSUPPORTED: ${path}`);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                files[path] = 'deleted';
            else
                throw error;
        }
    }
    const dirty = Boolean(git(root, ['status', '--porcelain=v1', '--untracked-files=all']));
    if (kind === 'committed' && dirty)
        throw new Error('DIRTY_ARTIFACT: PR verification requires a clean checkout');
    return { repoId, kind, commitSha, treeSha, indexTree, files, dirty, workspaceDigest: hash({ files, indexTree }), policyVersion: 1 };
}
export function sameFingerprint(a, b) {
    return a.repoId === b.repoId && a.kind === b.kind && a.commitSha === b.commitSha && a.treeSha === b.treeSha && a.workspaceDigest === b.workspaceDigest && a.policyVersion === b.policyVersion;
}
export function capturedBaseline(before) {
    const id = before.baselineId;
    const artifact = typeof id === 'string' ? protocol().artifacts[id] : undefined;
    return artifact && artifact.fingerprint.baselineId === artifact.id && hash(artifact.fingerprint) === hash(before) ? artifact.fingerprint : undefined;
}
export function capture(cwd, producer, parents = [], kind = 'working', purpose = { kind: 'baseline' }) {
    const id = uid('art');
    const fp = fingerprint(cwd, kind);
    const baselineId = purpose.kind === 'baseline' ? id : purpose.baseline?.baselineId;
    if (baselineId)
        fp.baselineId = baselineId;
    const artifact = { id, cwd: realpathSync(cwd), fingerprint: fp, parents, producer, createdAt: new Date().toISOString() };
    transact('artifact-captured', artifact.id, 'runtime', s => { s.artifacts[artifact.id] = artifact; return artifact; });
    return artifact;
}
