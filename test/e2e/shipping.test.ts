import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint } from "../../src/artifacts/fingerprint.ts";
import { verify } from "../../src/verification/runner.ts";
import { preparePR, openPreparedPR } from "../../src/delivery/prepare.ts";
import { refresh, eligibility, authorizeMerge, ship } from "../../src/delivery/frontier.ts";
import { protocol, type ProtocolState } from "../../src/runtime/protocol.ts";
import type { TaskReport } from "../../src/contracts/types.ts";
import { FAKE_PROVIDER, git, githubClient, initFixtureRepo, post, startGitHubServer, writeVerificationPolicy, spawnChild } from "./harness.ts";

const REMOTE = "https://github.com/loopback-owner/lemn-disposable.git";
const REPO = "loopback-owner/lemn-disposable";
const GATE = ["node", "-e", "process.exit(require('fs').readFileSync('change.txt','utf8').trim()==='change'?0:1)"];

interface Fixture {
  root: string; home: string; checkout: string; repoId: string; baseSha: string; headSha: string;
  restoreEnv(): void; dispose(): void;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(process.cwd(), ".e2e-ship-"));
  const home = join(root, "pstack");
  const checkout = join(root, "checkout");
  mkdirSync(home, { recursive: true });
  const previous = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = home;
  const baseSha = initFixtureRepo(checkout, REMOTE);
  const repoId = fingerprint(checkout, "committed").repoId;
  git(checkout, ["checkout", "-q", "-b", "feature/e2e"]);
  writeFileSync(join(checkout, "change.txt"), "change\n");
  git(checkout, ["add", "-A"]);
  git(checkout, ["commit", "-qm", "change"]);
  const headSha = git(checkout, ["rev-parse", "HEAD"]);
  writeVerificationPolicy(home, [GATE]);
  return {
    root, home, checkout, repoId, baseSha, headSha,
    restoreEnv() { if (previous === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = previous; },
    dispose() { rmSync(root, { recursive: true, force: true }); },
  };
}

function brief(f: Fixture) {
  return {
    id: "e2e-brief", revision: 1, contractLevel: "strict" as const, goal: "ship the verified commit",
    scope: { include: ["change.txt"], exclude: [], repoId: f.repoId },
    contextRefs: [], acceptance: [{ id: "ac1", description: "the change is shipped", required: true, gateIds: ["g1"] }],
    verification: [{ id: "g1", kind: "command" as const, command: GATE, sideEffect: "none" as const, category: "behavior" as const, required: true }],
    timeboxSeconds: 300, forbidden: [], standingOrders: [], reportFormat: "task-report-v1" as const,
  };
}

function report(f: Fixture): TaskReport {
  return { status: "completed", artifactRefs: [], base: f.baseSha, head: f.headSha, commandsRun: [GATE], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] };
}

async function verifiedLedger(f: Fixture, number: number) {
  return await verify(f.checkout, brief(f), { pr: { repoId: f.repoId, number, headSha: f.headSha, baseSha: f.baseSha }, report: report(f) });
}

function spec(f: Fixture, number = 1) {
  return { id: `e2e-ship-${number}`, repoId: f.repoId, repo: REPO, numbers: [number], owner: "e2e-operator", rootBase: "main" };
}

function events(): ProtocolState["events"] {
  return protocol().events;
}

test(`${FAKE_PROVIDER} a verified commit opens a pull request and its base, head, CI and review state are read back`, { timeout: 60_000 }, async () => {
  const f = fixture();
  const server = await startGitHubServer("passed", "approved");
  server.branches.set("main", f.baseSha);
  try {
    const ledger = await verifiedLedger(f, 1);
    assert.equal(ledger.status, "passed");
    assert.equal(ledger.contractAccepted, true);

    const plan = preparePR(f.checkout, ledger.id, { repo: REPO, base: "main", head: "feature/e2e", title: "e2e verified change" });
    assert.equal(plan.headSha, f.headSha);

    server.branches.set("feature/e2e", "f".repeat(40));
    await assert.rejects(openPreparedPR(f.checkout, plan, githubClient(server.port) as never, true), /REMOTE_BRANCH_NOT_VERIFIED/);
    assert.equal(server.views.size, 0, "an unverified remote head must not open a pull request");

    server.branches.set("feature/e2e", f.headSha);
    const opened = await openPreparedPR(f.checkout, plan, githubClient(server.port) as never, true) as { url: string };
    assert.match(opened.url, /\/pull\/1$/);
    assert.deepEqual(server.calls.filter((call) => call.op === "branch").slice(-1).map((call) => call.detail), ["feature/e2e"]);
    assert.deepEqual(server.calls.filter((call) => call.op === "open").map((call) => call.detail), ["1 main<-feature/e2e"]);

    const frontier = await refresh(spec(f), githubClient(server.port));
    const pr = frontier.prs[0]!;
    assert.equal(pr.baseRef, "main");
    assert.equal(pr.baseSha, f.baseSha);
    assert.equal(pr.headSha, f.headSha);
    assert.equal(pr.state, "OPEN");
    assert.equal(pr.ci, "passed");
    assert.equal(pr.review, "approved");
    assert.equal(pr.mergeable, "MERGEABLE");
    assert.deepEqual(eligibility(frontier), [{ number: 1, eligible: true, blockers: [] }]);
  } finally {
    await server.close();
    f.restoreEnv(); f.dispose();
  }
});

test(`${FAKE_PROVIDER} a stale head SHA blocks the merge`, { timeout: 60_000 }, async () => {
  const f = fixture();
  const server = await startGitHubServer("passed", "approved");
  try {
    await verifiedLedger(f, 1);
    server.branches.set("main", f.baseSha);
    server.branches.set("feature/e2e", f.headSha);
    server.views.set(1, { number: 1, headSha: f.headSha, baseSha: f.baseSha, baseRef: "main", state: "OPEN", draft: false, mergeState: "CLEAN", mergeable: "MERGEABLE", ci: "passed", review: "approved" });

    const client = githubClient(server.port);
    const frontier = await refresh(spec(f), client);
    const token = authorizeMerge(frontier, 1, "human-cli");

    const movedHead = "a".repeat(40);
    server.views.get(1)!.headSha = movedHead;
    await assert.rejects(ship(spec(f), client, { token, dryRun: false }), /AUTHORIZATION_MISSING_OR_STALE/);
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 0, "a moved head must not reach the merge call");

    const reauthorized = authorizeMerge(await refresh(spec(f), client), 1, "human-cli");
    await assert.rejects(ship(spec(f), client, { token: reauthorized, dryRun: false }), /SHIPPING_BLOCKED/);
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 0);
    assert.equal(eligibility(await refresh(spec(f), client))[0]!.blockers.includes("CURRENT_VERIFICATION_REQUIRED"), true);

    const rejected = await post(server.port, "/merge", { number: 1, headSha: f.headSha });
    assert.equal(rejected.status, 409, "the provider rejects a merge whose expected head is stale");
  } finally {
    await server.close();
    f.restoreEnv(); f.dispose();
  }
});

test(`${FAKE_PROVIDER} a crash before the external side effect replays exactly once and never double-merges`, { timeout: 90_000 }, async () => {
  const f = fixture();
  const server = await startGitHubServer("passed", "approved");
  try {
    await verifiedLedger(f, 1);
    server.branches.set("main", f.baseSha);
    server.branches.set("feature/e2e", f.headSha);
    server.views.set(1, { number: 1, headSha: f.headSha, baseSha: f.baseSha, baseRef: "main", state: "OPEN", draft: false, mergeState: "CLEAN", mergeable: "MERGEABLE", ci: "passed", review: "approved" });
    const token = authorizeMerge(await refresh(spec(f), githubClient(server.port)), 1, "human-cli");

    const child = spawnChild(join(process.cwd(), "test", "e2e", "fixture-child.mjs"), ["ship", String(server.port), f.checkout, f.home, f.repoId, REPO, "1", token, "crash-before"], {});
    const exited = await child.exit;
    assert.equal(exited.signal, "SIGKILL");
    assert.equal(server.views.get(1)!.state, "OPEN", "the remote never applied the merge");
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 0);
    assert.equal(events().some((event) => event.type === "merge-requested"), true, "the intent was durably recorded before the crash");
    assert.equal(events().some((event) => event.type === "merge-confirmed"), false);

    const replay = authorizeMerge(await refresh(spec(f), githubClient(server.port)), 1, "human-cli");
    const before = server.calls.length;
    const merged = await ship(spec(f), githubClient(server.port), { token: replay, dryRun: false }) as { merged: number };
    const recovery = server.calls.slice(before);
    assert.equal(recovery[0]!.op, "read", "recovery reads the remote state before any replay");
    assert.equal(merged.merged, 1);
    assert.equal(server.views.get(1)!.state, "MERGED");
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 1, "exactly one merge reached the provider");
  } finally {
    await server.close();
    f.restoreEnv(); f.dispose();
  }
});

test(`${FAKE_PROVIDER} a crash after the external side effect is at most once because recovery reads the remote first`, { timeout: 90_000 }, async () => {
  const f = fixture();
  const server = await startGitHubServer("passed", "approved");
  try {
    await verifiedLedger(f, 1);
    server.branches.set("main", f.baseSha);
    server.branches.set("feature/e2e", f.headSha);
    server.views.set(1, { number: 1, headSha: f.headSha, baseSha: f.baseSha, baseRef: "main", state: "OPEN", draft: false, mergeState: "CLEAN", mergeable: "MERGEABLE", ci: "passed", review: "approved" });
    const token = authorizeMerge(await refresh(spec(f), githubClient(server.port)), 1, "human-cli");

    const child = spawnChild(join(process.cwd(), "test", "e2e", "fixture-child.mjs"), ["ship", String(server.port), f.checkout, f.home, f.repoId, REPO, "1", token, "crash-after"], {});
    const exited = await child.exit;
    assert.equal(exited.signal, "SIGKILL");
    assert.equal(server.views.get(1)!.state, "MERGED", "the remote applied the merge before the crash");
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 1);
    assert.equal(events().some((event) => event.type === "merge-confirmed"), false, "the crash happened before confirmation was recorded");

    const before = server.calls.length;
    await assert.rejects(ship(spec(f), githubClient(server.port), { token, dryRun: false }), /AUTHORIZATION_MISSING_OR_STALE/);
    assert.equal(server.calls.slice(before)[0]!.op, "read", "the consumed-authorization path still reads the remote first");
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 1, "the merge is not replayed");

    const reauthorized = authorizeMerge(await refresh(spec(f), githubClient(server.port)), 1, "human-cli");
    await assert.rejects(ship(spec(f), githubClient(server.port), { token: reauthorized, dryRun: false }), /SHIPPING_BLOCKED/);
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 1, "a re-authorized replay is blocked by the merged remote state");

    const dry = await ship(spec(f), githubClient(server.port)) as { decisions: { blockers: string[] }[] };
    assert.deepEqual(dry.decisions[0]!.blockers, ["ALREADY_MERGED"]);
    assert.equal(server.calls.filter((call) => call.op === "merge").length, 1);
  } finally {
    await server.close();
    f.restoreEnv(); f.dispose();
  }
});
