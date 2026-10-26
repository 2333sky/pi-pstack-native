import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Run this script with cwd set to a clean consumer directory after installing the
// final .tgz. Resolve both the package and the peer SDK from that consumer.
const installedManifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
const installedDir = dirname(installedManifestPath);
const installedManifest = JSON.parse(readFileSync(installedManifestPath, "utf8"));
const consumerRequire = createRequire(resolve(process.cwd(), "package.json"));
assert.equal(realpathSync(consumerRequire.resolve(`${installedManifest.name}/package.json`)), realpathSync(installedManifestPath), "the installed package resolves by name from the consumer");
const extensionPath = resolve(installedDir, installedManifest.pi.extensions[0]);
// This SDK exposes its root entry only for ESM imports, not CommonJS require().
const sdkRoot = resolve(process.cwd(), "node_modules/@earendil-works/pi-coding-agent");
const sdkManifest = JSON.parse(readFileSync(join(sdkRoot, "package.json"), "utf8"));
const sdkVersion = sdkManifest.version.split('.').map(Number);
assert.ok(sdkVersion.length === 3 && sdkVersion.every(Number.isInteger) && sdkVersion[0] === 1 && sdkVersion[1] >= 4, "the installed peer satisfies the Pi 1.4+ / 1.x requirement");
const sdkEntry = resolve(sdkRoot, sdkManifest.exports["."].import);
const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(pathToFileURL(sdkEntry).href);

const distEntry = resolve(installedDir, installedManifest.exports["."].import);
const cliEntry = resolve(installedDir, installedManifest.bin["pstack-runner"]);
for (const published of [distEntry, cliEntry]) assert.ok(readFileSync(published, "utf8").length > 0, `published runtime file is present: ${published}`);

const api = await import(pathToFileURL(distEntry).href);
for (const name of ["fingerprint", "sameFingerprint", "verify", "buildTemplate", "ProgramCoordinator", "contextSnapshot", "migrate", "runnerOnce"]) {
  assert.equal(typeof api[name], "function", `published API exports ${name}`);
}

const sourceRead = await api.createResourceTools(join(installedDir, "skills"))[0].execute("installed-source", { action: "read", resource: "upstream/skills/poteto-mode/playbooks/shipping.md" });
assert.equal(sourceRead.details.resource, "upstream/skills/poteto-mode/playbooks/shipping.md");
assert.ok(sourceRead.details.lines.some(line => line.text.includes("### Shipping")), "installed upstream snapshot is readable with its verified blob ID");
const statechartHelp = spawnSync(process.execPath, [join(installedDir, "skills/statechart/scripts/statechart.mjs"), "--help"], { encoding: "utf8" });
assert.equal(statechartHelp.status, 0, statechartHelp.stderr);
assert.match(statechartHelp.stdout, /from-spec/);

const testRoot = mkdtempSync(join(process.cwd(), ".installed-package-smoke-"));
const agentDir = join(testRoot, "pi-agent");
const cwd = join(testRoot, "checkout");
const pstackHome = join(testRoot, "pstack-native");
mkdirSync(agentDir, { recursive: true });
mkdirSync(cwd, { recursive: true });
mkdirSync(pstackHome, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PSTACK_NATIVE_HOME = pstackHome;
writeFileSync(join(cwd, "sample.txt"), "baseline\n");
for (const args of [["init", "-q"], ["config", "user.name", "Smoke"], ["config", "user.email", "smoke@example.invalid"], ["add", "."], ["commit", "-qm", "baseline"]]) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}
const before = api.fingerprint(cwd);
assert.equal(before.kind, "working");
assert.equal(before.dirty, false);
assert.deepEqual(Object.keys(before.files), ["sample.txt"]);
assert.equal(api.sameFingerprint(before, api.fingerprint(cwd)), true);
writeFileSync(join(cwd, "sample.txt"), "changed\n");
assert.equal(api.sameFingerprint(before, api.fingerprint(cwd)), false);
writeFileSync(join(cwd, "sample.txt"), "baseline\n");

const noArgs = spawnSync(process.execPath, [cliEntry], { encoding: "utf8" });
assert.equal(noArgs.status, 1, "the published CLI rejects an unknown action");
assert.match(noArgs.stderr, /Usage: pstack-runner run CONFIG/, "the published CLI prints its usage");
const migrate = spawnSync(process.execPath, [cliEntry, "migrate"], { encoding: "utf8" });
assert.equal(migrate.status, 0, "the published CLI migrates an empty store without failing");
assert.deepEqual(JSON.parse(migrate.stdout), { dryRun: true, records: [] }, "empty store migration invents no records");

let session;
try {
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    noExtensions: true,
    additionalExtensionPaths: [extensionPath],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await resourceLoader.reload();
  const loaded = await createAgentSession({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(),
    resourceLoader,
    noTools: "builtin",
  });
  session = loaded.session;
  assert.equal(loaded.extensionsResult.errors.length, 0, "installed extension loads without Pi diagnostics");
  assert.ok(loaded.extensionsResult.extensions.some((extension) => extension.path === extensionPath));
  for (const name of ["pstack_semantics", "pstack_skill", "pstack_agents", "pstack_workflow", "pstack_graph", "pstack_worktrees", "pstack_verify", "pstack_delivery", "pstack_context", "pstack_program"]) {
    assert.ok(session.getAllTools().some((tool) => tool.name === name), `installed package registered ${name}`);
    assert.ok(session.getActiveToolNames().includes(name), `installed package activated ${name}`);
  }
  console.log(`installed package smoke PASS: ${installedManifestPath}`);
  console.log(`real Pi SDK entry PASS: ${sdkEntry}`);
  console.log(`published API PASS: ${distEntry}`);
  console.log(`published CLI PASS: ${cliEntry}`);
  console.log(`registered tools PASS: ${session.getActiveToolNames().filter((name) => name.startsWith("pstack_")).join(", ")}`);
} finally {
  session?.dispose();
  rmSync(testRoot, { recursive: true, force: true });
}
