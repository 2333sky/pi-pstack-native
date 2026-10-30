import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const pkg=JSON.parse(readFileSync("package.json","utf8"));
const lock=JSON.parse(readFileSync("package-lock.json","utf8"));
if(pkg.name!=="pi-pstack-native" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version) || lock.name!==pkg.name || lock.version!==pkg.version || lock.packages?.[""]?.name!==pkg.name || lock.packages?.[""]?.version!==pkg.version) throw new Error("package identity drift");
const versionLine=readFileSync("src/extension.ts","utf8").split("\n").find(line=>line.startsWith("const VERSION ="));
if(!versionLine || !versionLine.includes('"package.json"')) throw new Error("src/extension.ts must read VERSION from package.json instead of hardcoding it");
if(pkg.dependencies && Object.keys(pkg.dependencies).length) throw new Error("runtime dependencies; Pi host APIs belong in peerDependencies");
for(const name of Object.keys(pkg.peerDependencies??{})) if(!name.startsWith("@earendil-works/")) throw new Error(`non-official peer dependency: ${name}`);
if(!pkg.peerDependencies?.["@earendil-works/pi-coding-agent"]) throw new Error("missing Pi coding-agent peer dependency");
if(JSON.stringify(pkg.pi).includes("skills")) throw new Error("skills must be discovered by the extension so /pstack on|off can work");
const forbidden=["@whamp/pi-pstack","pi-subagents","pi-durable-subagents","pi-agents"];
const texts=[];
function walk(p){for(const n of readdirSync(p)){const f=join(p,n),s=statSync(f); if(s.isDirectory()) walk(f); else if(/\.(ts|mjs|json)$/.test(n)) texts.push([f,readFileSync(f,"utf8")]);}}
walk("src");
for(const [file,text] of texts) for(const dep of forbidden) if(text.includes(`from \"${dep}`)||text.includes(`from '${dep}`)||text.includes(`require(\"${dep}`)) throw new Error(`forbidden runtime import ${dep} in ${file}`);
console.log("package policy ok: official Pi peer runtime only");
