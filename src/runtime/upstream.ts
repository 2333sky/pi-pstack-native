import { readFileSync } from 'node:fs';
/** The active source pin; semantic approval is recorded separately from source availability. */
export function upstreamVersion():string {
  const metadata=JSON.parse(readFileSync(new URL('../../UPSTREAM.json',import.meta.url),'utf8'));
  if(typeof metadata.version!=='string' || !/^[\w.+-]+$/.test(metadata.version))throw new Error('UPSTREAM_METADATA_INVALID');
  return metadata.version;
}
