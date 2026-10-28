import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fingerprint, sameFingerprint } from "../artifacts/fingerprint.js";
/** Copy the exact staged, unstaged and untracked review target into a new Git worktree. */
export function copyReviewSnapshot(source, target) {
    const root = realpathSync(execFileSync('git', ['-C', source, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
    const dest = realpathSync(target);
    const before = fingerprint(root);
    const git = (args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 32 * 1024 * 1024 });
    const apply = (patch, staged) => {
        if (!patch.length)
            return;
        const result = spawnSync('git', ['-C', dest, 'apply', '--binary', ...(staged ? ['--index'] : [])], { input: patch, maxBuffer: 32 * 1024 * 1024 });
        if (result.status !== 0)
            throw new Error(`REVIEW_SNAPSHOT_PATCH_FAILED: ${result.stderr.toString('utf8').slice(0, 1000)}`);
    };
    apply(git(['diff', '--no-ext-diff', '--binary', '--cached', 'HEAD', '--']), true);
    apply(git(['diff', '--no-ext-diff', '--binary', '--']), false);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean);
    for (const path of untracked) {
        if (isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..'))
            throw new Error('REVIEW_SNAPSHOT_UNSAFE_PATH');
        const from = join(root, path), to = join(dest, path);
        const parent = realpathSync(dirname(from));
        const rel = relative(root, parent);
        if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
            throw new Error('REVIEW_SNAPSHOT_UNSAFE_PATH');
        mkdirSync(dirname(to), { recursive: true });
        const destParent = realpathSync(dirname(to));
        if (!destParent.startsWith(`${dest}${sep}`) && destParent !== dest)
            throw new Error('REVIEW_SNAPSHOT_UNSAFE_PATH');
        const stat = lstatSync(from);
        if (stat.isSymbolicLink())
            symlinkSync(readlinkSync(from), to);
        else if (stat.isFile())
            copyFileSync(from, to);
        else
            throw new Error('REVIEW_SNAPSHOT_UNSUPPORTED_FILE');
    }
    if (!sameFingerprint(before, fingerprint(root)) || !sameFingerprint(before, fingerprint(dest)))
        throw new Error('REVIEW_SNAPSHOT_CHANGED');
}
