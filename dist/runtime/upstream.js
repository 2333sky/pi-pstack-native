import { readFileSync } from 'node:fs';
/** The reviewed baseline, not a candidate detected by the synchronizer. */
export function upstreamVersion() {
    const metadata = JSON.parse(readFileSync(new URL('../../UPSTREAM.json', import.meta.url), 'utf8'));
    if (typeof metadata.version !== 'string' || !/^[\w.+-]+$/.test(metadata.version))
        throw new Error('UPSTREAM_METADATA_INVALID');
    return metadata.version;
}
