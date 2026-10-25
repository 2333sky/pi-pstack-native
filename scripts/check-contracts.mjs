import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContracts, contractPath, validateContracts } from './upstream/playbooks.mjs';

const root = process.cwd();
const fresh = buildContracts({ root });
if (process.argv.includes('--write')) {
  writeFileSync(join(root, contractPath), `${JSON.stringify(fresh, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'written', contracts: fresh.contracts.length }));
} else {
  const committed = JSON.parse(readFileSync(join(root, contractPath), 'utf8'));
  validateContracts(committed, { root });
  if (JSON.stringify(committed) !== JSON.stringify(fresh)) throw new Error(`CONTRACT_DRIFT in ${contractPath}; run npm run upstream:contracts`);
  console.log(JSON.stringify({ status: 'in-sync', contracts: fresh.contracts.length }));
}
