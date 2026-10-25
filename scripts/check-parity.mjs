import { checkParity } from './upstream/parity.mjs';
const counts = checkParity(process.cwd());
const pending = [...counts.pendingTarget.skills, ...counts.pendingTarget.playbooks];
console.log(`parity manifest ok: ${counts.skills} skills and ${counts.playbooks} playbooks registered; ${pending.length ? `pending target: ${pending.join(', ')}` : 'no pending target'}; auxiliary file-level parity not claimed`);
