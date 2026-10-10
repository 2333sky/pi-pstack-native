import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const roots=["src","test","scripts"];
const files=[];
function walk(p){ for(const n of readdirSync(p)){ const f=join(p,n),s=statSync(f); if(s.isDirectory()) walk(f); else if(/\.(ts|mjs)$/.test(n)) files.push(f); } }
for(const root of roots) walk(root);
for(const file of files){ const args=file.endsWith('.ts')?["--experimental-strip-types","--check",file]:["--check",file]; const r=spawnSync(process.execPath,args,{encoding:"utf8"}); if(r.status!==0){ process.stderr.write(r.stderr||r.stdout); throw new Error(`syntax check failed: ${file}`); } }
console.log(`syntax ok: ${files.length} files`);
