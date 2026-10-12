import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

const KINDS = ["adversarial-review-finding", "crash-recovery", "cross-module-feature", "integration-conflict", "interface-api-regression", "long-context-program", "stacked-pull-request"];
const tasksLib = () => import("../benchmarks/lib/tasks.mjs");
const reportLib = () => import("../benchmarks/lib/report.mjs");
const runLib = () => import("../benchmarks/lib/run.mjs");
const withFixture = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-bench-"));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test("task sets declare fixed fixtures, independent artifact tests and budgets", async () => {
  const { loadTasks } = await tasksLib();
  const tasks = loadTasks() as any[];
  assert.deepEqual(tasks.map((t) => t.kind).sort(), KINDS);
  for (const task of tasks) {
    assert.ok(task.successCriteria.length >= 2, `${task.id} has no success criteria`);
    assert.ok(task.budget.timeSeconds > 0 && task.budget.costUsd > 0 && task.budget.tokens > 0, `${task.id} has no time, cost and token budget`);
    assert.ok(task.expects.provider && task.expects.model && task.expects.effort, `${task.id} declares no provider, model and effort`);
    assert.ok(task.fixture.snapshot ?? task.fixture.generate, `${task.id} has no snapshot and no generator`);
    assert.ok(task.gates.length && task.gates.every((g: any) => g.category && (g.command?.length || (g.kind === "diff" && Number.isInteger(g.maxFiles)))), `${task.id} has no independent artifact test`);
    assert.ok(task.nodes.every((n: any) => n.goal && n.plannedChanges && n.gateIds.length), `${task.id} has an unplanned node`);
    assert.ok(task.failureModes.length, `${task.id} declares no failure modes`);
  }
});

test("task fixtures are byte deterministic and the long context fixture carries the declared volume", async () => {
  const { loadTasks, buildWorkspace } = await tasksLib();
  await withFixture(async (base) => {
    for (const task of loadTasks() as any[]) {
      const first = buildWorkspace(task, join(base, task.id, "one"));
      const second = buildWorkspace(task, join(base, task.id, "two"));
      assert.equal(second.workspaceDigest, first.workspaceDigest, `${task.id} is not deterministic`);
      assert.equal(second.treeSha, first.treeSha, `${task.id} commit tree is not deterministic`);
      assert.equal(first.repoId.length, 64);
      if (task.fixture.contextBytesMin) assert.ok(first.contextBytes >= task.fixture.contextBytesMin, `${task.id} context is ${first.contextBytes} bytes`);
    }
  });
});

test("failure taxonomy is human reviewed and covers every declared mode", async () => {
  const { loadTasks } = await tasksLib();
  const { loadTaxonomy } = await reportLib();
  const taxonomy = loadTaxonomy() as any;
  assert.ok(taxonomy.version >= 1 && taxonomy.reviewedAt && taxonomy.reviewedBy);
  assert.ok(taxonomy.categories.length >= 8);
  for (const category of taxonomy.categories) {
    assert.equal(category.reviewed, true, `${category.id} is not human reviewed`);
    assert.ok(category.evidence?.length && category.detection?.length, `${category.id} has no evidence or detection rule`);
  }
  const ids = new Set(taxonomy.categories.map((c: any) => c.id));
  for (const task of loadTasks() as any[]) for (const mode of [...task.failureModes, ...Object.values(task.fixture.mutants ?? {}).map((m: any) => m.category)]) assert.ok(ids.has(mode), `${task.id} declares unknown failure mode ${mode}`);
});

test("baselines are marked not run and Cursor cloud capability is separated", async () => {
  const { loadBaselines } = await reportLib();
  const baselines = loadBaselines() as any;
  assert.equal(baselines.measured, false);
  assert.equal(baselines.overallSuperiority, null);
  assert.deepEqual(baselines.items.map((b: any) => b.id).sort(), ["cursor-pstack-cloud", "pi-pstack-native", "pi-single-agent"]);
  for (const item of baselines.items) {
    assert.equal(item.status, "not-run");
    assert.ok(item.reason?.length, `${item.id} states no reason`);
  }
  assert.equal(baselines.items.find((b: any) => b.id === "cursor-pstack-cloud").comparable, false);
  assert.equal(baselines.cursorCloudOnly.comparability, "not-comparable");
  assert.ok(baselines.cursorCloudOnly.capabilities.length >= 3);
  assert.match(baselines.cursorCloudOnly.claim, /no overall superiority/i);
});

test("report schema fails closed on an unmeasured metric reported as zero", async () => {
  const { validateReport, metric, unmeasured } = await reportLib();
  assert.deepEqual(unmeasured("no provider call").value, null);
  assert.equal(metric(3, true).value, 3);
  assert.throws(() => metric(null, true), /MEASURED_METRIC_REQUIRES_VALUE/);
  assert.throws(() => metric(0, false), /UNMEASURED_METRIC_REQUIRES_NULL/);
  assert.throws(() => metric(null, false), /UNMEASURED_METRIC_REQUIRES_REASON/);
  const { runTaskSets } = await runLib();
  await withFixture(async (base) => {
    const result = await runTaskSets({ provider: "fake", output: join(base, "out"), only: ["cross-module-feature"] }) as any;
    assert.equal(validateReport(structuredClone(result.report)).aggregate.sampleSize, 1);
    const zeroed = structuredClone(result.report);
    zeroed.aggregate.verifiedTaskSuccess = { value: 0, measured: false, reason: "reported as zero", scope: "harness" };
    assert.throws(() => validateReport(zeroed), /UNMEASURED_METRIC_REQUIRES_NULL/);
  });
});

test("the offline provider runs the task sets and records only measured metrics", async () => {
  const { runTaskSets } = await runLib();
  await withFixture(async (base) => {
    const result = await runTaskSets({ provider: "fake", output: join(base, "out"), only: ["cross-module-feature", "crash-recovery"] }) as any;
    assert.equal(result.exitCode, 0, JSON.stringify(result.report.tasks.map((t: any) => [t.id, t.failureCategory])));
    assert.equal(result.blocked, undefined);
    assert.equal(result.report.measurement.credentialedCalls, 0);
    assert.equal(result.report.tasks.length, 2);
    assert.ok(result.report.tasks.every((t: any) => t.verified), "an offline reference run left a task unverified");
    assert.equal(result.report.aggregate.tokens.value, null);
    assert.equal(result.report.aggregate.costUsd.value, null);
    assert.equal(result.report.aggregate.latencyMs.measured, true);
    assert.equal(result.report.aggregate.verifiedTaskSuccess.value, 1);
    const written = JSON.parse(readFileSync(join(base, "out", "report.json"), "utf8"));
    assert.deepEqual(written.measurement, result.report.measurement);
  });
});

test("a mutant plan is reported unverified under its declared failure category", async () => {
  const { runTaskSets } = await runLib();
  await withFixture(async (base) => {
    const result = await runTaskSets({ provider: "fake", mutant: "integration-intent-lost", output: join(base, "out"), only: ["integration-conflict"] }) as any;
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.tasks.length, 1);
    assert.equal(result.report.tasks[0].verified, false);
    assert.equal(result.report.tasks[0].failureCategory, "integration-intent-lost");
    assert.equal(result.report.aggregate.verifiedTaskSuccess.value, 0);
  });
});

test("the report schema refuses a mutant task that claims verification or a mismatched category", async () => {
  const { runTaskSets } = await runLib();
  const { validateReport } = await reportLib();
  await withFixture(async (base) => {
    const result = await runTaskSets({ provider: "fake", mutant: "integration-intent-lost", output: join(base, "out"), only: ["integration-conflict"] }) as any;
    assert.equal(result.report.tasks[0].mutantCategory, "integration-intent-lost");
    assert.equal(validateReport(structuredClone(result.report)).tasks[0].mutantCategory, "integration-intent-lost");
    const claimed = structuredClone(result.report);
    claimed.tasks[0].verified = true;
    claimed.tasks[0].failureCategory = "provider-blocked";
    assert.throws(() => validateReport(claimed), /REPORT_MUTANT_CATEGORY/);
    const mismatched = structuredClone(result.report);
    mismatched.tasks[0].failureCategory = "scope-violation";
    assert.throws(() => validateReport(mismatched), /REPORT_MUTANT_CATEGORY/);
  });
});

test("one offline pass over the whole task set publishes no interval", async () => {
  const { runTaskSets } = await runLib();
  await withFixture(async (base) => {
    const result = await runTaskSets({ provider: "fake", output: join(base, "out") }) as any;
    assert.equal(result.report.tasks.length, 7);
    assert.equal(result.report.aggregate.interval95.value, null);
    assert.match(result.report.aggregate.interval95.reason, /repetition/);
    assert.equal(result.report.measurement.repetitions, 1);
  });
});

test("the task-set runner refuses unsupported repetitions before writing output", async () => {
  const { runTaskSets } = await runLib();
  await withFixture(async (base) => {
    const output = join(base, "out");
    await assert.rejects(() => runTaskSets({ provider: "fake", output, repetitions: 5 }), /UNSUPPORTED_REPETITIONS/);
    assert.equal(existsSync(output), false);
    for (const repetitions of [0, -1, 1.5, "5", null]) {
      await assert.rejects(() => runTaskSets({ provider: "fake", output, repetitions }), /UNSUPPORTED_REPETITIONS/);
      assert.equal(existsSync(output), false);
    }
    const result = await runTaskSets({ provider: "fake", output, repetitions: 1, only: ["cross-module-feature"] }) as any;
    assert.equal(result.report.measurement.repetitions, 1);
    assert.equal(result.report.aggregate.sampleSize, 1);
    assert.deepEqual(result.report.aggregate.interval95, {
      value: null,
      method: null,
      reason: "repetitions are not supported; this report has one observation per task, not repeated observations of the same task",
    });
  });
});

test("the report schema refuses unsupported repetitions and single-pass intervals", async () => {
  const { runTaskSets } = await runLib();
  const { validateReport } = await reportLib();
  await withFixture(async (base) => {
    const result = await runTaskSets({ provider: "fake", output: join(base, "out") }) as any;
    const repeated = structuredClone(result.report);
    repeated.measurement.repetitions = 5;
    repeated.aggregate.interval95 = { value: [0.6457, 1], method: "wilson-95", reason: null };
    assert.throws(() => validateReport(repeated), /REPORT_REPETITIONS_UNSUPPORTED/);
    const interval = structuredClone(result.report);
    interval.aggregate.interval95 = { value: [0.6457, 1], method: "wilson-95", reason: null };
    assert.throws(() => validateReport(interval), /REPORT_INTERVAL_UNSUPPORTED/);
  });
});

test("the report schema reconciles aggregate success with six reference rows and one real mutant", async () => {
  const { runTaskSets } = await runLib();
  const { validateReport } = await reportLib();
  await withFixture(async (base) => {
    const reference = await runTaskSets({ provider: "fake", output: join(base, "reference") }) as any;
    const mutant = await runTaskSets({ provider: "fake", mutant: "integration-intent-lost", output: join(base, "mutant"), only: ["integration-conflict"] }) as any;
    assert.equal(reference.report.aggregate.verified, 7);
    assert.equal(mutant.report.aggregate.verified, 0);
    const mixed = structuredClone(reference.report);
    mixed.tasks[mixed.tasks.findIndex((task: any) => task.id === "integration-conflict")] = structuredClone(mutant.report.tasks[0]);
    assert.equal(mixed.tasks.filter((task: any) => task.verified).length, 6);
    assert.equal(mixed.tasks.filter((task: any) => task.mutantCategory === "integration-intent-lost" && !task.verified).length, 1);
    assert.throws(() => validateReport(mixed), /REPORT_AGGREGATE_VERIFIED/);
    mixed.aggregate.verified = 6;
    mixed.aggregate.verifiedTaskSuccess.value = 6 / 7;
    mixed.aggregate.retries.value = mixed.tasks.reduce((total: number, task: any) => total + task.metrics.retries.value, 0);
    mixed.aggregate.integrationFailures.value = 1;
    assert.equal(validateReport(structuredClone(mixed)).aggregate.verified, 6);
    assert.equal(validateReport(structuredClone(mixed)).aggregate.verifiedTaskSuccess.value, 6 / 7);
    for (const [field, value, error] of [
      ["sampleSize", 8, /REPORT_AGGREGATE_SAMPLE_SIZE/],
      ["verified", 7, /REPORT_AGGREGATE_VERIFIED/],
      ["verified", -1, /REPORT_AGGREGATE_VERIFIED/],
      ["verified", 6.5, /REPORT_AGGREGATE_VERIFIED/],
    ] as const) {
      const changed = structuredClone(mixed);
      changed.aggregate[field] = value;
      assert.throws(() => validateReport(changed), error);
    }
    const rate = structuredClone(mixed);
    rate.aggregate.verifiedTaskSuccess.value = 1;
    assert.throws(() => validateReport(rate), /REPORT_AGGREGATE_TASK_SUCCESS/);
    const row = structuredClone(mixed);
    row.tasks.find((task: any) => task.id === "integration-conflict").metrics.verifiedTaskSuccess.value = 1;
    assert.throws(() => validateReport(row), /REPORT_TASK_SUCCESS/);
  });
});

test("a configured provider without credentials blocks the task-set runner", async () => {
  const { runTaskSets } = await runLib();
  await withFixture(async (base) => {
    const result = await runTaskSets({ provider: "configured", agentDir: join(base, "agent"), model: "test/model", allowModelOverride: true, output: join(base, "out"), only: ["cross-module-feature"] }) as any;
    assert.equal(result.exitCode, 1);
    assert.equal(result.blocked, "AUTHENTICATION_UNAVAILABLE");
    assert.equal(result.report.tasks.every((t: any) => !t.verified), true);
    assert.equal(result.report.aggregate.verifiedTaskSuccess.value, null);
    assert.match(result.report.aggregate.verifiedTaskSuccess.reason, /AUTHENTICATION_UNAVAILABLE/);
    assert.equal(result.report.measurement.credentialedCalls, 0);
  });
});

test("the packaged task-set entry runs offline and fails closed without credentials", () => {
  const base = mkdtempSync(join(tmpdir(), "pstack-benchmark-tasks-"));
  try {
    const pkg = copyPackage(join(base, "pkg"));
    const out = join(base, "out");
    const ran = spawnSync(process.execPath, ["scripts/benchmark.mjs", "--set", "tasks", "--provider", "fake", "--only", "cross-module-feature", "--output", out], { cwd: pkg, encoding: "utf8" });
    assert.equal(ran.status, 0, `offline task-set run failed\n${ran.stdout}${ran.stderr}`);
    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8"));
    assert.equal(report.tasks.length, 1);
    assert.equal(report.tasks[0].verified, true);
    assert.equal(report.aggregate.tokens.value, null);
    const blocked = spawnSync(process.execPath, ["scripts/benchmark.mjs", "--set", "tasks", "--provider", "configured", "--agent-dir", join(base, "agent"), "--model", "test/model", "--allow-model-override", "--only", "cross-module-feature", "--output", join(base, "blocked")], { cwd: pkg, encoding: "utf8" });
    assert.equal(blocked.status, 1, `blocked task-set run reported success\n${blocked.stdout}${blocked.stderr}`);
    assert.match(blocked.stderr, /benchmark blocked: AUTHENTICATION_UNAVAILABLE/);
    const blockedReport = JSON.parse(readFileSync(join(base, "blocked", "report.json"), "utf8"));
    assert.equal(blockedReport.tasks[0].failureCategory, "provider-blocked");
    assert.equal(blockedReport.aggregate.verifiedTaskSuccess.value, null);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
