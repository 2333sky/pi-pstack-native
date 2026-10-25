import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { capture, fingerprint, git, ownerOf } from "../src/artifacts/fingerprint.ts";
import { protocol, transact } from "../src/runtime/protocol.ts";
import { verify } from "../src/verification/runner.ts";
import type { TaskBrief } from "../src/contracts/types.ts";

function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".test-baseline-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  process.env.PSTACK_NATIVE_HOME = join(root, "state");
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["config", "user.email", "test@example.invalid"]);
  writeFileSync(join(repo, "allowed.txt"), "baseline");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "baseline"]);
  return { root, repo, cleanup() { rmSync(root, { recursive: true, force: true }); delete process.env.PSTACK_NATIVE_HOME; } };
}

function brief(repo: string, revision = 1): TaskBrief {
  return {
    id: "task", revision, contractLevel: "strict", goal: "Check scope",
    scope: { repoId: fingerprint(repo).repoId, include: ["allowed.txt"], exclude: [] },
    contextRefs: [], acceptance: [{ id: "scope", description: "Scope", required: true, gateIds: ["diff"] }],
    verification: [{ id: "diff", kind: "diff", maxFiles: 0 }], forbidden: [], standingOrders: [],
    reportFormat: "task-report-v1", timeboxSeconds: 10,
  };
}

function baseline(repo: string, owner: Parameters<typeof ownerOf>[0], extra: { workflowId?: string; callKey?: string } = {}) {
  return capture(repo, undefined, [], "working", { kind: "baseline", owner: ownerOf(owner, extra) }).fingerprint;
}

function reasonOf(ledger: { evidenceRefs: string[] }): string | undefined {
  return protocol().evidence[ledger.evidenceRefs[0]!]?.reason;
}

test("a baseline captured for one workflow cannot verify another workflow", async () => {
  const f = fixture();
  try {
    const b = brief(f.repo);
    const captured = baseline(f.repo, b, { workflowId: "wf_alpha", callKey: "write" });
    const ledger = await verify(f.repo, b, { before: captured, owner: ownerOf(b, { workflowId: "wf_beta", callKey: "write" }) });
    assert.equal(ledger.status, "blocked");
    assert.equal(reasonOf(ledger), "BASELINE_NOT_OWNED");
    assert.equal(ledger.contractAccepted, false);
  } finally { f.cleanup(); }
});

test("a workflow baseline cannot be consumed outside its workflow", async () => {
  const f = fixture();
  try {
    const b = brief(f.repo);
    const captured = baseline(f.repo, b, { workflowId: "wf_alpha", callKey: "write" });
    const ledger = await verify(f.repo, b, { before: captured, owner: { briefId: b.id, briefRevision: b.revision } });
    assert.equal(ledger.status, "blocked");
    assert.equal(reasonOf(ledger), "BASELINE_NOT_OWNED");
  } finally { f.cleanup(); }
});

test("a baseline captured under an older brief revision is refused", async () => {
  const f = fixture();
  try {
    const captured = baseline(f.repo, brief(f.repo, 1));
    const ledger = await verify(f.repo, brief(f.repo, 2), { before: captured });
    assert.equal(ledger.status, "blocked");
    assert.equal(reasonOf(ledger), "BASELINE_NOT_OWNED");
  } finally { f.cleanup(); }
});

test("a baseline captured without an owner is refused", async () => {
  const f = fixture();
  try {
    const b = brief(f.repo);
    const captured = baseline(f.repo, b);
    transact("test-owner-stripped", "artifact", "test", (state) => {
      delete state.artifacts[(captured as { baselineId?: string }).baselineId!]!.owner;
      return null;
    });
    const ledger = await verify(f.repo, b, { before: captured });
    assert.equal(ledger.status, "blocked");
    assert.equal(reasonOf(ledger), "BASELINE_NOT_OWNED");
  } finally { f.cleanup(); }
});

test("a baseline captured in another checkout is refused there", async () => {
  const f = fixture();
  try {
    const other = join(f.root, "other");
    mkdirSync(other);
    git(other, ["init", "-q"]);
    git(other, ["config", "user.name", "Test"]);
    git(other, ["config", "user.email", "test@example.invalid"]);
    writeFileSync(join(other, "allowed.txt"), "baseline");
    git(other, ["add", "."]);
    git(other, ["commit", "-qm", "baseline"]);
    const b = brief(f.repo);
    const captured = baseline(f.repo, b);
    const ledger = await verify(other, brief(other), { before: captured, owner: ownerOf(brief(other)) });
    assert.equal(ledger.status, "blocked");
    assert.equal(reasonOf(ledger), "DIFF_BASE_UNAVAILABLE");
  } finally { f.cleanup(); }
});

test("the same task keeps its baseline across a recovery", async () => {
  const f = fixture();
  try {
    const b = brief(f.repo);
    const owner = ownerOf(b, { workflowId: "wf_alpha", callKey: "write" });
    const captured = baseline(f.repo, b, { workflowId: "wf_alpha", callKey: "write" });
    const report = (artifact: typeof captured) => ({ status: "completed" as const, base: artifact.commitSha, head: artifact.commitSha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] });
    for (const attempt of [1, 2]) {
      const ledger = await verify(f.repo, b, { before: captured, owner, report: report(captured) });
      assert.equal(ledger.status, "passed", `recovery attempt ${attempt} keeps the owned baseline`);
      assert.equal(ledger.contractAccepted, true, `recovery attempt ${attempt} accepts the contract`);
    }
  } finally { f.cleanup(); }
});
