import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJSON } from './upstream/core.mjs';
import { buildInventory, readSnapshot, validateInventory } from './upstream/inventory.mjs';

export function checkInventory(root) {
  const snapshot = readSnapshot(root), parity = readJSON(join(root,'PARITY.json'));
  const path = 'docs/upstream-inventory-0.15.36.json', committed = readFileSync(join(root,path),'utf8');
  const inputs = {snapshot,parity,localRoot:root};
  validateInventory(JSON.parse(committed),inputs);
  const inventory = validateInventory(buildInventory(inputs),inputs);
  if(committed !== JSON.stringify(inventory,null,2)+'\n') throw new Error('INVENTORY_Drift in '+path+'; run npm run upstream:inventory');
  return inventory;
}
if(import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    const inventory = checkInventory(process.cwd());
    console.log(JSON.stringify({status:'in-sync',files:inventory.counts.files}));
  } catch(error) {
    console.error('Inventory check failed: '+error.message);
    process.exitCode = 1;
  }
}
