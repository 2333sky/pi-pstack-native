import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint } from "../../dist/artifacts/fingerprint.js";

export const BUNDLE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TASKS_ROOT = join(BUNDLE, "tasks");
export const KINDS = ["cross-module-feature", "integration-conflict", "stacked-pull-request", "crash-recovery", "adversarial-review-finding", "long-context-program", "interface-api-regression"];

const FIXED_DATE = "2026-01-01T00:00:00.000Z";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Benchmark", GIT_AUTHOR_EMAIL: "benchmark@example.invalid",
  GIT_COMMITTER_NAME: "Benchmark", GIT_COMMITTER_EMAIL: "benchmark@example.invalid",
  GIT_AUTHOR_DATE: FIXED_DATE, GIT_COMMITTER_DATE: FIXED_DATE,
};

export function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: GIT_ENV }).trimEnd();
}

export function tryGit(cwd, ...args) {
  try { return { status: 0, out: git(cwd, ...args) }; }
  catch (error) { return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }; }
}

export function commit(cwd, message) {
  git(cwd, "add", "-A");
  const staged = tryGit(cwd, "diff", "--cached", "--quiet");
  if (staged.status === 0) return { committed: false, head: git(cwd, "rev-parse", "HEAD") };
  git(cwd, "commit", "-qm", message);
  return { committed: true, head: git(cwd, "rev-parse", "HEAD") };
}

export function loadTasks(root = TASKS_ROOT) {
  const tasks = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "task.json")))
    .map((entry) => readTask(root, entry.name))
    .sort((left, right) => (left.id < right.id ? -1 : 1));
  const seen = new Set(tasks.map((task) => task.kind));
  for (const kind of KINDS) if (!seen.has(kind)) throw new Error(`MISSING_TASK_SET: ${kind}`);
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) throw new Error("DUPLICATE_TASK_ID");
  return tasks;
}

function readTask(root, name) {
  const dir = join(root, name);
  const task = JSON.parse(readFileSync(join(dir, "task.json"), "utf8"));
  task.dir = dir;
  validateTask(task);
  return task;
}

function validateTask(task) {
  const need = (value, what) => { if (!value) throw new Error(`TASK_INCOMPLETE: ${task.id ?? "?"}.${what}`); };
  need(task.id && task.kind === task.id && KINDS.includes(task.kind), "id/kind");
  need(task.title, "title");
  need(task.goal, "goal");
  need(Array.isArray(task.successCriteria) && task.successCriteria.length >= 2, "successCriteria");
  need(task.expects?.provider && task.expects?.model && task.expects?.effort, "expects");
  need(task.budget?.timeSeconds > 0 && task.budget?.costUsd > 0 && task.budget?.tokens > 0, "budget");
  need(task.fixture && (task.fixture.snapshot || task.fixture.generate), "fixture");
  if (task.fixture.snapshot) need(existsSync(join(task.dir, "repo")), "fixture.repo");
  need(existsSync(join(task.dir, "checks")), "checks");
  need(Array.isArray(task.gates) && task.gates.length, "gates");
  need(Array.isArray(task.nodes) && task.nodes.length, "nodes");
  need(Array.isArray(task.failureModes) && task.failureModes.length, "failureModes");
  const gateIds = new Set();
  for (const gate of task.gates) {
    need(gate.id && gate.category && !gateIds.has(gate.id), `gate.${gate.id}`);
    gateIds.add(gate.id);
    const kind = gate.kind ?? "command";
    need(kind === "command" ? gate.command?.[0] === "node" : kind === "diff" && Number.isInteger(gate.maxFiles), `gate.${gate.id}.kind`);
    if (kind === "command") need(existsSync(join(task.dir, "checks", gate.command.at(-1).replace("checks/", ""))), `gate.${gate.id}.check`);
  }
  const keys = new Set();
  for (const node of task.nodes) {
    need(node.key && !keys.has(node.key), `node.${node.key}`);
    keys.add(node.key);
    need(node.profile && node.goal && node.plannedChanges && node.plan, `node.${node.key}`);
    need(existsSync(join(task.dir, node.plan)), `node.${node.key}.plan`);
    need(Array.isArray(node.gateIds) && node.gateIds.length && node.gateIds.every((id) => gateIds.has(id)), `node.${node.key}.gateIds`);
    need(Array.isArray(node.include) && node.include.length, `node.${node.key}.include`);
    for (const dep of node.dependsOn ?? []) need(keys.has(dep), `node.${node.key}.dependsOn`);
  }
  for (const [name, mutant] of Object.entries(task.fixture.mutants ?? {})) {
    need(mutant.category, `mutants.${name}.category`);
    for (const planFile of Object.values(mutant.plan ?? {})) need(existsSync(join(task.dir, planFile)), `mutants.${name}.plan`);
    if (mutant.findings) need(existsSync(join(task.dir, mutant.findings)), `mutants.${name}.findings`);
  }
}

export function generateFixture(spec, dir) {
  mkdirSync(join(dir, "src/modules"), { recursive: true });
  const labels = [];
  for (let index = 0; index < spec.modules; index++) {
    const label = `mod-${String(index).padStart(3, "0")}`;
    const lines = [`export const index = ${index};`, `export const label = ${JSON.stringify(label)};`];
    for (let line = 0; line < spec.linesPerModule; line++) lines.push(`export const segment${String(line).padStart(3, "0")} = ${index * 1000 + line};`);
    lines.push(spec.anomalyIndex === index ? `export function scale(value) { return value * ${spec.factor} + 1; }` : `export function scale(value) { return value * ${spec.factor}; }`);
    writeFileSync(join(dir, "src/modules", `${label}.mjs`), `${lines.join("\n")}\n`);
    labels.push(label);
  }
  writeFileSync(join(dir, "src/index.mjs"), `export const factor = ${spec.factor};\nexport const modules = ${JSON.stringify(labels, null, 2)};\n`);
  writeFileSync(join(dir, "README.md"), `# program\n\n${spec.modules} generated modules. Every module exports \`scale(value)\` and must satisfy \`scale(value) === value * factor\`.\n`);
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
}

export function buildWorkspace(task, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (task.fixture.generate) generateFixture(task.fixture.generate, dir);
  else cpSync(join(task.dir, "repo"), dir, { recursive: true });
  cpSync(join(task.dir, "checks"), join(dir, "checks"), { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.name", "Benchmark");
  git(dir, "config", "user.email", "benchmark@example.invalid");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "fixture");
  const print = fingerprint(dir);
  return { cwd: dir, base: git(dir, "rev-parse", "--abbrev-ref", "HEAD"), repoId: print.repoId, treeSha: git(dir, "rev-parse", "HEAD^{tree}"), workspaceDigest: print.workspaceDigest, commitSha: print.commitSha, contextBytes: trackedBytes(dir) };
}

function trackedBytes(cwd) {
  return git(cwd, "ls-files").split("\n").filter(Boolean).reduce((total, file) => total + statSync(join(cwd, file)).size, 0);
}

export function buildBrief(task, node, workspace) {
  const gates = node.gateIds.map((id) => task.gates.find((gate) => gate.id === id));
  return {
    id: `${task.id}-${node.key}`, revision: 1, contractLevel: "strict", goal: node.goal,
    scope: { include: node.include, exclude: ["checks/**", ".git/**", "node_modules/**"], repoId: workspace.repoId },
    contextRefs: node.contextRefs ?? [],
    acceptance: gates.map((gate) => ({ id: `${gate.id}-acceptance`, description: `${gate.id} passes`, required: true, gateIds: [gate.id] })),
    verification: gates.map((gate) => gate.kind === "diff"
      ? { id: gate.id, kind: "diff", maxFiles: gate.maxFiles, category: gate.category }
      : { id: gate.id, kind: "command", command: gate.command, timeoutSeconds: gate.timeoutSeconds ?? 60, sideEffect: "none", category: gate.category, coverage: gate.coverage }),
    timeboxSeconds: task.budget.timeSeconds,
    forbidden: node.forbidden ?? ["change the checks directory", "remote write"],
    standingOrders: task.standingOrders ?? ["Change only files inside the declared scope.", "Return a task-report-v1 JSON block."],
    reportFormat: "task-report-v1",
    ...(node.reportRequirements ? { reportRequirements: node.reportRequirements } : {}),
  };
}

export function verificationPolicy(tasks) {
  return { commands: tasks.flatMap((task) => task.gates.filter((gate) => gate.command).map((gate) => gate.command)) };
}
