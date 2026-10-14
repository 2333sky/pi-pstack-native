import assert from 'node:assert/strict';
import { test } from 'node:test';
import notify from './notify.cjs';
test('AC-08 deduplicate all-state Issues, no change writes nothing, API failure surfaces',async()=>{
  const issues=[],calls=[];
  const github={paginate:async()=>issues,rest:{issues:{listForRepo(){},create:async args=>{calls.push(args);const data={number:1,...args};issues.push(data);return {data};},update:async args=>{calls.push(args);}}}};
  const report={schemaVersion:1,syncId:`${'a'.repeat(12)}_${'b'.repeat(12)}`,baseline:{sha:'a'.repeat(40)},candidate:{sha:'b'.repeat(40)},status:'changes_detected',changes:[{}]};
  const args={github,owner:'test',repo:'test',report};
  assert.equal((await notify(args)).status,'created');assert.equal((await notify(args)).status,'updated');assert.equal(calls.length,1);
  report.status='no_change';assert.equal((await notify(args)).status,'no_change');assert.equal(calls.length,1);
  report.status='changes_detected';github.paginate=async()=>{throw new Error('rate limited');};await assert.rejects(notify(args),/rate limited/);
});
