#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};
const repo = flag("repo");
const confirm = flag("confirm");
const base = flag("base") ?? "main";
const pr = flag("pr");
const clone = flag("clone") ? resolve(flag("clone")) : undefined;
const write = argv.includes("--write");
const home = flag("home") ? resolve(flag("home")) : mkdtempSync(join(tmpdir(), "pstack-e2e-live-"));

if (!repo || !confirm) {
  process.stderr.write("usage: node --experimental-strip-types scripts/e2e-live.mjs --repo owner/name --confirm owner/name [--base main] [--pr 12] [--clone /path --write] [--home /path]\n");
  process.exit(2);
}
if (repo !== confirm) {
  process.stderr.write(`refusing to run: --confirm must repeat --repo exactly (${repo})\n`);
  process.exit(2);
}
if (write && !clone) {
  process.stderr.write("refusing to run: --write requires an explicit --clone of the named repository\n");
  process.exit(2);
}
mkdirSync(home, { recursive: true });
const auth = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
if (auth.status !== 0) {
  process.stderr.write(`refusing to run: gh is not authenticated\n${auth.stderr || auth.stdout}`);
  process.exit(2);
}

const env = {
  ...process.env,
  PSTACK_E2E_LIVE: "1",
  PSTACK_E2E_LIVE_REPO: repo,
  PSTACK_E2E_LIVE_CONFIRM: confirm,
  PSTACK_E2E_LIVE_BASE: base,
  PSTACK_E2E_LIVE_WRITE: write ? "1" : "0",
  PSTACK_NATIVE_HOME: home,
  ...(pr ? { PSTACK_E2E_LIVE_PR: pr } : {}),
  ...(clone ? { PSTACK_E2E_LIVE_CLONE: clone } : {}),
};
delete env.NODE_TEST_CONTEXT;
delete env.NODE_TEST_WORKER_ID;

process.stdout.write(`live tier target ${repo} base ${base} write ${write} home ${home}\n`);
const run = spawnSync(process.execPath, ["--experimental-strip-types", "--test", join("test", "live", "github-live.test.ts")], { cwd: process.cwd(), env, stdio: "inherit" });
process.stdout.write(`\nlive tier exit ${run.status}\ncleanup: close any pull request opened by this run, delete its branch, then remove ${write ? "the probe commit in " + clone + " and " : ""}${home}\n`);
process.exit(run.status ?? 1);
