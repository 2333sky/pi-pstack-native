import { checkParity } from './upstream/parity.mjs';
const counts = checkParity(process.cwd());
console.log(`parity manifest ok: ${counts.skills} upstream skills, ${counts.playbooks} playbooks, 0 pending in listed semantic scope; auxiliary file-level parity not claimed`);
