import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
const PREFIX = 'upstream/';
/** Snapshot access is Markdown-only and checks every path component, including the snapshot root. */
export function semanticResource(packageRoot, id) {
    if (id === 'pi-adapter.md') {
        const file = join(packageRoot, 'docs/PI-SEMANTIC-ADAPTER.md');
        if (lstatSync(join(packageRoot, 'docs')).isSymbolicLink() || lstatSync(file).isSymbolicLink())
            throw new Error('UPSTREAM_SYMLINK_REFUSED');
        return readFileSync(file, 'utf8');
    }
    if (!id.startsWith(PREFIX))
        return undefined;
    const path = id.slice(PREFIX.length);
    if (!/^skills\/[a-z0-9-]+\/(?:SKILL\.md|(?:references|playbooks)\/[a-zA-Z0-9_./-]+\.md)$/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..'))
        throw new Error('INVALID_UPSTREAM_RESOURCE');
    const root = realpathSync(packageRoot);
    const manifest = JSON.parse(readFileSync(join(root, 'SEMANTICS.json'), 'utf8'));
    const entry = manifest.snapshot.files.find((f) => f.path === `pstack/${path}`);
    if (!entry)
        throw new Error('UNMAPPED_UPSTREAM_RESOURCE');
    let file = root;
    for (const part of ['vendor', 'upstream', '0.15.17', 'pstack', ...path.split('/')]) {
        file = join(file, part);
        if (lstatSync(file).isSymbolicLink())
            throw new Error('UPSTREAM_SYMLINK_REFUSED');
    }
    if (!realpathSync(file).startsWith(root + sep) || !lstatSync(file).isFile())
        throw new Error('UPSTREAM_RESOURCE_ESCAPES_ROOT');
    const bytes = readFileSync(file);
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (sha !== entry.sha)
        throw new Error('UPSTREAM_SOURCE_DRIFT');
    return bytes.toString('utf8');
}
