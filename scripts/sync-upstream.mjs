#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const root = fromIndex >= 0 ? resolve(args[fromIndex + 1] ?? "") : undefined;
const writeIndex = args.indexOf("--write-report");
const reportPath = writeIndex >= 0 ? resolve(args[writeIndex + 1] ?? "UPSTREAM_AUDIT.json") : undefined;
if (!root || !existsSync(root)) {
  console.error("Usage: node scripts/sync-upstream.mjs --from /path/to/cursor/plugins/pstack [--write-report report.json]");
  process.exit(2);
}
const skillsRoot = join(root, "skills");
if (!existsSync(skillsRoot)) throw new Error(`No skills directory: ${skillsRoot}`);

const parity = JSON.parse(readFileSync("PARITY.json", "utf8"));
const upstream = JSON.parse(readFileSync("UPSTREAM.json", "utf8"));

function directories(path) {
  return readdirSync(path, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
}
function files(path) {
  const out = [];
  if (!existsSync(path)) return out;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const upstreamSkills = directories(skillsRoot);
const localSkills = Object.keys(parity.skills ?? {}).sort();
const skillAdded = upstreamSkills.filter((x) => !localSkills.includes(x));
const skillMissing = localSkills.filter((x) => !upstreamSkills.includes(x));

const playbookRoot = join(skillsRoot, "poteto-mode", "playbooks");
const upstreamPlaybooks = files(playbookRoot).filter((p) => p.endsWith(".md")).map((p) => basename(p, ".md")).sort();
const localPlaybooks = Object.keys(parity.playbooks ?? {}).sort();
const playbookAdded = upstreamPlaybooks.filter((x) => !localPlaybooks.includes(x));
const playbookMissing = localPlaybooks.filter((x) => !upstreamPlaybooks.includes(x));

const seamPatterns = [
  ["cursor-task", /\bTask\b|subagent_type/g],
  ["cursor-path", /~\/\.cursor\/|\.cursor\//g],
  ["cursor-loop", /(^|\s)\/loop\b/gm],
  ["cursor-custom-mode", /Custom Mode/g],
  ["cursor-cloud-agent", /cloud agent|cloud-agent/gi],
  ["cursor-ask-question", /AskQuestion/g],
];
const seamFiles = [];
const allUpstreamFiles = files(root);
for (const path of allUpstreamFiles) {
  let body;
  try { body = readFileSync(path, "utf8"); } catch { continue; }
  const seams = [];
  for (const [name, re] of seamPatterns) {
    re.lastIndex = 0;
    const count = [...body.matchAll(re)].length;
    if (count) seams.push({ name, count });
  }
  if (seams.length) seamFiles.push({ path: relative(root, path), seams });
}

const upstreamManifestPath = join(root, ".cursor-plugin", "plugin.json");
let discoveredVersion;
if (existsSync(upstreamManifestPath)) {
  try { discoveredVersion = JSON.parse(readFileSync(upstreamManifestPath, "utf8")).version; } catch { /* report below */ }
}
const versionMatches = discoveredVersion === upstream.version;
const namesAligned = skillAdded.length === 0 && skillMissing.length === 0 && playbookAdded.length === 0 && playbookMissing.length === 0;

const report = {
  sourceRoot: root,
  expected: { version: upstream.version, commit: upstream.commit },
  discovered: { version: discoveredVersion, skillCount: upstreamSkills.length, playbookCount: upstreamPlaybooks.length, fileCount: allUpstreamFiles.length },
  names: { skillAdded, skillMissing, playbookAdded, playbookMissing },
  cursorRuntimeSeams: seamFiles,
  claimBoundary: "This audit aligns top-level skill/playbook names and surfaces Cursor runtime seams. It does not mechanically approve semantic changes; changed upstream content still requires review and parity tests.",
  status: namesAligned && versionMatches ? "review-seams-and-content" : "manifest-drift",
};

if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!namesAligned || !versionMatches) process.exitCode = 1;
