import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Run this script with cwd set to a clean consumer directory after installing the
// final .tgz. Resolve both the package and the peer SDK from that consumer.
const consumerRequire = createRequire(resolve(process.cwd(), "package.json"));
const installedManifest = consumerRequire.resolve("2333/package.json");
const extensionPath = resolve(installedManifest, "../src/extension.ts");
// This SDK exposes its root entry only for ESM imports, not CommonJS require().
const sdkRoot = resolve(process.cwd(), "node_modules/@earendil-works/pi-coding-agent");
const sdkManifest = JSON.parse(readFileSync(join(sdkRoot, "package.json"), "utf8"));
assert.match(sdkManifest.version, /^1\.1\./, "the installed peer is the official Pi Coding Agent 1.1.x package");
const sdkEntry = resolve(sdkRoot, sdkManifest.exports["."].import);
const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(pathToFileURL(sdkEntry).href);
const testRoot = mkdtempSync(join(process.cwd(), ".installed-package-smoke-"));
const agentDir = join(testRoot, "pi-agent");
const cwd = join(testRoot, "checkout");
const pstackHome = join(testRoot, "pstack-native");
mkdirSync(agentDir, { recursive: true });
mkdirSync(cwd, { recursive: true });
mkdirSync(pstackHome, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PSTACK_NATIVE_HOME = pstackHome;

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
  for (const name of ["pstack_agents", "pstack_workflow", "pstack_graph", "pstack_worktrees", "pstack_verify", "pstack_delivery", "pstack_context", "pstack_program"]) {
    assert.ok(session.getAllTools().some((tool) => tool.name === name), `installed package registered ${name}`);
    assert.ok(session.getActiveToolNames().includes(name), `installed package activated ${name}`);
  }
  console.log(`installed package smoke PASS: ${installedManifest}`);
  console.log(`real Pi SDK entry PASS: ${sdkEntry}`);
  console.log(`registered tools PASS: ${session.getActiveToolNames().filter((name) => name.startsWith("pstack_")).join(", ")}`);
} finally {
  session?.dispose();
  rmSync(testRoot, { recursive: true, force: true });
}
