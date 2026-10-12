import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubCLI } from "../../src/delivery/provider.ts";
import { liveTier } from "../live/guard.ts";
import { OFFLINE, cleanEnv, git, githubClient, initFixtureRepo, redactCaptured, startGitHubServer } from "./harness.ts";

const PROTECTED = "2333sky/pi-pstack-native";
const REPO = "loopback-owner/lemn-disposable";

test(`${OFFLINE} the credentialed live tier never runs without an explicit operator target`, () => {
  const none = liveTier("read", {}, PROTECTED);
  assert.equal(none.open, false);
  assert.match(none.reason, /PSTACK_E2E_LIVE is not set/);
  assert.equal(liveTier("read", { PSTACK_E2E_LIVE: "1" }, PROTECTED).open, false);
  assert.equal(liveTier("read", { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: "owner/name" }, PROTECTED).open, false);
  assert.equal(liveTier("read", { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: "owner/name", PSTACK_E2E_LIVE_CONFIRM: "owner/other" }, PROTECTED).open, false);
  assert.equal(liveTier("read", { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: PROTECTED, PSTACK_E2E_LIVE_CONFIRM: PROTECTED }, PROTECTED).open, false);
  assert.equal(liveTier("read", { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: "owner/name", PSTACK_E2E_LIVE_CONFIRM: "owner/name" }, "owner/name").open, false);
  assert.match(liveTier("write", { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: "owner/name", PSTACK_E2E_LIVE_CONFIRM: "owner/name", PSTACK_E2E_LIVE_WRITE: "1" }, PROTECTED).reason, /PSTACK_E2E_LIVE_CLONE/);
  const named = liveTier("read", { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: "owner/name", PSTACK_E2E_LIVE_CONFIRM: "owner/name" }, PROTECTED);
  assert.equal(named.open, true);
  assert.equal(named.repo, "owner/name");
  const operator = { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: "owner/name", PSTACK_E2E_LIVE_CONFIRM: "owner/name" };
  assert.equal(liveTier("write", operator, PROTECTED).open, false);
  const residual = { PSTACK_E2E_LIVE_WRITE: "1", PSTACK_E2E_LIVE_CLONE: "/tmp/absent-clone" };
  assert.equal(liveTier("read", residual, PROTECTED).open, false);
  assert.equal(liveTier("write", residual, PROTECTED).open, false);
});

test(`${OFFLINE} the live tier is skipped by default when its own file runs`, { timeout: 120_000 }, () => {
  const file = join("test", "live", "github-live.test.ts");
  const env = cleanEnv({ PSTACK_E2E_LIVE: "", PSTACK_E2E_LIVE_REPO: "", PSTACK_E2E_LIVE_CONFIRM: "", PSTACK_E2E_LIVE_WRITE: "" });
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--test", file], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /ℹ skipped 2/);
  assert.match(run.stdout, /ℹ fail 0/);
});

const CHECKOUT_PROBE = "git -C <current checkout> remote get-url origin";

function observedCommands(probe: string): string[] {
  if (!existsSync(probe)) return [];
  return readFileSync(probe, "utf8").split("\n").filter(Boolean).map((line) => String(JSON.parse(line).command))
    .map((command) => /^git -C .+ remote get-url origin$/.test(command) ? CHECKOUT_PROBE : command);
}

function matrixEnv(row: Record<string, string>, preload: string, probe: string): NodeJS.ProcessEnv {
  const env = cleanEnv();
  for (const key of Object.keys(env)) if (key.startsWith("PSTACK_E2E_LIVE")) delete env[key];
  for (const [key, value] of Object.entries(row)) env[key] = value;
  env.NODE_OPTIONS = `--import=${preload}`;
  env.PSTACK_E2E_COMMAND_PROBE = probe;
  return env;
}

test(`${OFFLINE} every refused live-tier environment runs no external command and enters no write path`, { timeout: 300_000 }, async (t) => {
  const root = mkdtempSync(join(process.cwd(), ".e2e-live-matrix-"));
  const probe = join(root, "observed-commands.jsonl");
  const preload = pathToFileURL(resolve("test", "live", "command-probe-register.mjs")).href;
  const liveFile = resolve("test", "live", "github-live.test.ts");
  const residual = { PSTACK_E2E_LIVE_WRITE: "1", PSTACK_E2E_LIVE_CLONE: join(root, "absent-clone") };
  const named = { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: REPO, PSTACK_E2E_LIVE_CONFIRM: REPO };
  const rows: Array<{ label: string; env: Record<string, string>; origin?: string; expected: string[] }> = [
    { label: "no live environment at all", env: {}, expected: [] },
    { label: "a residual PSTACK_E2E_LIVE_WRITE and PSTACK_E2E_LIVE_CLONE with nothing else", env: residual, expected: [] },
    { label: "a residual write and clone plus a repository name", env: { ...residual, PSTACK_E2E_LIVE_REPO: REPO }, expected: [] },
    { label: "a residual write and clone with the full operator name minus PSTACK_E2E_LIVE", env: { ...residual, PSTACK_E2E_LIVE_REPO: REPO, PSTACK_E2E_LIVE_CONFIRM: REPO }, expected: [] },
    { label: "a residual PSTACK_E2E_LIVE_CLONE alone", env: { PSTACK_E2E_LIVE_CLONE: residual.PSTACK_E2E_LIVE_CLONE }, expected: [] },
    { label: "PSTACK_E2E_LIVE=1 with no repository", env: { PSTACK_E2E_LIVE: "1" }, expected: [] },
    { label: "PSTACK_E2E_LIVE=1 with a repository and no confirmation", env: { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: REPO }, expected: [] },
    { label: "PSTACK_E2E_LIVE=1 with a mismatched confirmation", env: { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: REPO, PSTACK_E2E_LIVE_CONFIRM: "loopback-owner/other" }, expected: [] },
    { label: "PSTACK_E2E_LIVE=1 naming the protected repository", env: { PSTACK_E2E_LIVE: "1", PSTACK_E2E_LIVE_REPO: PROTECTED, PSTACK_E2E_LIVE_CONFIRM: PROTECTED }, expected: [] },
    { label: "PSTACK_E2E_LIVE=1 with write and no clone", env: { ...named, PSTACK_E2E_LIVE_WRITE: "1" }, expected: [] },
    { label: "PSTACK_E2E_LIVE=1 with a residual write, a clone and the repository of the current checkout", env: { ...named, PSTACK_E2E_LIVE_WRITE: "1", PSTACK_E2E_LIVE_CLONE: join(root, "absent-clone-2") }, origin: REPO, expected: [CHECKOUT_PROBE] },
  ];
  try {
    for (const [index, row] of rows.entries()) {
      await t.test(row.label, { timeout: 120_000 }, () => {
        const checkout = join(root, `checkout-${index}`);
        if (row.origin) initFixtureRepo(checkout, `https://github.com/${row.origin}.git`);
        rmSync(probe, { force: true });
        const run = spawnSync(process.execPath, ["--experimental-strip-types", "--test", liveFile], {
          cwd: row.origin ? checkout : process.cwd(), encoding: "utf8", env: matrixEnv(row.env, preload, probe),
        });
        assert.equal(run.status, 0, `${row.label}\n${run.stdout}${run.stderr}`);
        assert.match(run.stdout, /ℹ skipped 2/, row.label);
        assert.match(run.stdout, /ℹ fail 0/, row.label);
        assert.deepEqual(observedCommands(probe), row.expected, `${row.label} ran an unexpected external command`);
      });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test(`${OFFLINE} every test in the live tier consults only the guard gate`, () => {
  const files = readdirSync(join("test", "live")).filter((name) => name.endsWith(".test.ts"));
  assert.equal(files.includes("github-live.test.ts"), true);
  for (const file of files) {
    const source = readFileSync(join("test", "live", file), "utf8");
    const tests = source.match(/\btest\(/g) ?? [];
    const gates = source.match(/skip:\s*(\w+)\.skip/g) ?? [];
    assert.equal(tests.length > 0, true, `${file} declares no test`);
    assert.equal(gates.length, tests.length, `${file} must gate every test with a guard skip`);
    assert.equal(/process\.env\.PSTACK_E2E_LIVE/.test(source), false, `${file} must not read the live environment directly`);
    assert.equal(/\bliveTarget\(/.test(source), false, `${file} must not consult the raw target`);
    for (const gate of gates) {
      const name = gate.replace(/^skip:\s*/, "").replace(/\.skip$/, "");
      assert.match(source, new RegExp(`const ${name} = liveTier\\(`), `${file} must derive ${name} from liveTier`);
    }
  }
});

test(`${OFFLINE} GitHubCLI rejects invalid repository and pull request inputs before it touches gh`, async () => {
  const provider = new GitHubCLI();
  await assert.rejects(provider.read("not a repository", 1), /Invalid GitHub PR/);
  await assert.rejects(provider.read("owner/name", 0), /Invalid GitHub PR/);
  await assert.rejects(provider.read("owner/name", 1.5), /Invalid GitHub PR/);
});

test(`${OFFLINE} the GitHub provider refuses a merge whose expected head is stale`, { timeout: 60_000 }, async () => {
  const server = await startGitHubServer("passed", "approved");
  try {
    server.views.set(1, { number: 1, headSha: "b".repeat(40), baseSha: "a".repeat(40), baseRef: "main", state: "OPEN", mergeable: "MERGEABLE", ci: "passed", review: "approved" });
    const client = githubClient(server.port);
    await assert.rejects(client.merge({ number: 1, headSha: "c".repeat(40) }), /HEAD_MOVED/);
    assert.equal(server.views.get(1)!.state, "OPEN");
    await client.merge({ number: 1, headSha: "b".repeat(40) });
    assert.equal(server.views.get(1)!.state, "MERGED");
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 2);
  } finally { await server.close(); }
});

test(`${OFFLINE} a disposable fixture repository never carries credentials in captured output`, () => {
  const captured = redactCaptured(`cloning https://ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@github.com/${REPO}.git`);
  assert.equal(captured.includes("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), false);
  assert.equal(captured.includes(`https://[REDACTED]@github.com/${REPO}.git`), true);
  const root = mkdtempSync(join(process.cwd(), ".e2e-offline-"));
  try {
    const head = initFixtureRepo(join(root, "checkout"), `https://github.com/${REPO}.git`);
    assert.match(head, /^[0-9a-f]{40}$/);
    assert.equal(git(join(root, "checkout"), ["remote", "get-url", "origin"]), `https://github.com/${REPO}.git`);
    assert.equal(existsSync(join(root, "checkout", "base.txt")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
