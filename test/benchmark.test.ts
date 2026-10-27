import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exitCode, parseArgs } from "../scripts/benchmark.mjs";

test("parser defaults the output path and rejects missing required flags", () => {
  assert.deepEqual(parseArgs(["--agent-dir", "/tmp/agent", "--model", "provider/model"]), { agentDir: "/tmp/agent", model: "provider/model", output: "benchmark-output" });
  assert.equal(parseArgs(["--agent-dir", "/tmp/agent", "--model", "provider/model", "--output", "/tmp/out"]).output, "/tmp/out");
  assert.throws(() => parseArgs(["--agent-dir", "/tmp/agent"]));
  assert.throws(() => parseArgs(["--model", "provider/model"]));
  assert.throws(() => parseArgs([]));
  assert.equal(parseArgs(["--agent-dir", "a", "--model", "p/m", "--limit", "3", "--max-tokens", "1000"]).limit, 3);
  assert.throws(() => parseArgs(["--agent-dir", "a", "--model", "p/m", "--limit", "0"]), /Invalid --limit/);
  assert.throws(() => parseArgs(["--agent-dir", "a", "--model", "p/m", "--limt", "3"]), /Unknown/);
  assert.throws(() => parseArgs(["--agent-dir", "a", "--model", "p/m", "--limit"]), /missing/i);
});

test("exit policy fails closed", () => {
  assert.equal(exitCode([{ verified: true }, { verified: true }], []), 0);
  assert.equal(exitCode([{ verified: true }, { verified: false }], []), 1);
  assert.equal(exitCode([{ verified: false }], [{ status: "blocked", reason: "AUTHENTICATION_UNAVAILABLE" }]), 1);
  assert.equal(exitCode([{ verified: true }, { verified: true }], [{ status: "blocked", reason: "AUTHENTICATION_UNAVAILABLE" }]), 1);
  assert.equal(exitCode([], []), 1);
});

const copyPackage = (dir) => {
  const repo = process.cwd();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  for (const script of ["benchmark.mjs", "check-benchmark.mjs"]) cpSync(join(repo, "scripts", script), join(dir, "scripts", script));
  cpSync(join(repo, "UPSTREAM.json"), join(dir, "UPSTREAM.json"));
  cpSync(join(repo, "benchmarks"), join(dir, "benchmarks"), { recursive: true });
  cpSync(join(repo, "dist"), join(dir, "dist"), { recursive: true });
  symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
};
const runCheck = (root) => spawnSync(process.execPath, [join(root, "scripts/check-benchmark.mjs")], { env: { ...process.env, PSTACK_BENCHMARK_ROOT: root }, encoding: "utf8" });

test("check-benchmark proves the entry links against a tampered root", () => {
  const base = mkdtempSync(join(tmpdir(), "pstack-benchmark-"));
  try {
    const pristine = copyPackage(join(base, "pristine"));
    const tampered = join(base, "tampered");
    cpSync(pristine, tampered, { recursive: true });
    const service = join(tampered, "dist/runner/service.js");
    writeFileSync(service, readFileSync(service, "utf8").replace("export async function runnerOnce", "async function runnerOnce"));
    const bad = runCheck(tampered);
    assert.notEqual(bad.status, 0, `tampered root unexpectedly passed\n${bad.stdout}${bad.stderr}`);
    const good = runCheck(pristine);
    assert.equal(good.status, 0, `pristine root failed\n${good.stdout}${good.stderr}`);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("a symlinked entry runs the benchmark instead of exiting green", () => {
  const base = mkdtempSync(join(tmpdir(), "pstack-benchmark-link-"));
  try {
    const pkg = copyPackage(join(base, "pkg"));
    symlinkSync(join(pkg, "scripts/benchmark.mjs"), join(pkg, "scripts/benchmark-link.mjs"));
    for (const argv of [["scripts/benchmark-link.mjs"], ["--preserve-symlinks-main", "scripts/benchmark-link.mjs"]]) {
      const linked = spawnSync(process.execPath, argv, { cwd: pkg, encoding: "utf8" });
      assert.notEqual(linked.status, 0, `${argv.join(" ")} exited green without running\n${linked.stdout}${linked.stderr}`);
      assert.match(linked.stderr, /benchmark requires explicit --agent-dir/, `${argv.join(" ")} did not reach the benchmark argument guard\n${linked.stderr}`);
    }
    const output = join(base, "out");
    const ran = spawnSync(process.execPath, ["scripts/benchmark-link.mjs", "--agent-dir", join(base, "agent"), "--model", "test/model", "--output", output], { cwd: pkg, encoding: "utf8" });
    assert.equal(ran.status, 1, `symlinked benchmark run reported success\n${ran.stdout}${ran.stderr}`);
    assert.match(ran.stderr, /AUTHENTICATION_UNAVAILABLE/);
    const results = JSON.parse(readFileSync(join(output, "results.json"), "utf8"));
    assert.equal(results.rows.length, 20);
    assert.equal(results.rows.filter((row: { verified: boolean }) => row.verified).length, 0);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
