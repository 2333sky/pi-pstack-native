import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeConfined } from './upstream/core.mjs';
import { buildRecords, recordsPath, validateRecords } from './upstream/records.mjs';

const serialize = document => `${JSON.stringify(document, null, 2)}\n`;

export function checkRecords(root) {
  if (!existsSync(join(root, recordsPath))) throw new Error(`RECORDS_MISSING in ${recordsPath}; run npm run registry:records`);
  validateRecords(JSON.parse(readFileSync(join(root, recordsPath), 'utf8')), { root });
  const fresh = validateRecords(buildRecords({ root }), { root });
  if (readFileSync(join(root, recordsPath), 'utf8') !== serialize(fresh)) throw new Error(`RECORDS_Drift in ${recordsPath}; run npm run registry:records`);
  return fresh;
}
function writeRecords(root) {
  const fresh = validateRecords(buildRecords({ root }), { root });
  writeConfined(root, recordsPath, serialize(fresh));
  return fresh;
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const root = process.cwd();
  try {
    if (process.argv.includes('--write')) {
      const document = writeRecords(root);
      console.log(JSON.stringify({ status: 'written', path: recordsPath, records: document.records.length }));
    } else {
      const document = checkRecords(root);
      console.log(JSON.stringify({ status: 'in-sync', path: recordsPath, records: document.records.length }));
    }
  } catch (error) {
    console.error('Records check failed: ' + error.message);
    process.exitCode = 1;
  }
}
