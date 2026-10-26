import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentHost } from "../../src/agent/host.ts";
import { fingerprint } from "../../src/artifacts/fingerprint.ts";
import { protocol } from "../../src/runtime/protocol.ts";
import { verify } from "../../src/verification/runner.ts";
import { OFFLINE, initFixtureRepo, startModelServer, toolResultText, writeVerificationPolicy } from "./harness.ts";
import { openParentContext, type ParentContext } from "./parent-context.ts";

const READ_ONLY = ["find", "grep", "ls", "pstack_evidence", "pstack_skill", "read"];

test(`${OFFLINE} reported src defect: read-only child profiles receive no read-only tools`, {}, async () => {
  const root = mkdtempSync(join(process.cwd(), ".e2e-defect-tools-"));
  const home = join(root, "pstack");
  const agentDir = join(root, "pi-agent");
  const checkout = join(root, "checkout");
  const previousHome = process.env.PSTACK_NATIVE_HOME;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PSTACK_NATIVE_HOME = home;
  mkdirSync(home, { recursive: true });
  initFixtureRepo(checkout, "https://github.com/loopback-owner/lemn-disposable.git");
  const model = await startModelServer(call => {
    if(call.step===0)return {tool:{name:"pstack_skill",args:{action:"read",resource:"how/SKILL.md"}}};
    if(call.step===1)return {tool:{name:"pstack_evidence",args:{category:"issues"}}};
    if(call.step===2)return {tool:{name:"read",args:{path:join(root,"outside.txt")}}};
    return {text:"Bundled skill inspected; issue snapshot supplied; outside read refused."};
  });
  let parent: ParentContext | undefined;
  try {
    parent = await openParentContext({ agentDir, cwd: checkout, modelPort: model.port, sessionDir: join(root, "parent-sessions") });
    const host = new AgentHost();
    writeFileSync(join(root,"outside.txt"),"PRIVATE_OUTSIDE_DATA");
    const evidencePackets:any[]=[{category:"issues",status:"available",reason:"authorized parent query",items:[{source:"https://github.com/test/repo/issues/1",observedAt:"2026-10-14T00:00:00Z",excerpt:"Issue snapshot supplied by parent."}]}];
    const started = host.start({ evidencePackets, profile: "reviewer", task: "TASK:readonly inspect the assigned checkout", cwd: checkout }, parent.ctx);
    const done = await host.wait(started.id);
    assert.equal(done?.state, "completed", done?.error?.message);
    const active = [...new Set(model.calls.flatMap((call) => call.tools))].sort();
    assert.deepEqual(active, READ_ONLY, "a read-only child must be able to inspect its own checkout");
    const observed=model.calls.map(c=>toolResultText(c.messages)).join("\n");
    assert.match(observed, /"resource":\s*"how\/SKILL\.md"/);
    assert.ok(observed.includes("# How"));
    assert.ok(observed.includes("Issue snapshot supplied by parent."));
    assert.ok(observed.includes("escapes child workspace"));
    assert.ok(!observed.includes("PRIVATE_OUTSIDE_DATA"));
    assert.equal(active.some((name) => ["bash", "edit", "write", "powershell"].includes(name)), false);
  } finally {
    parent?.dispose();
    await model.close();
    if (previousHome === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = previousHome;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
});

test(`${OFFLINE} reported src defect: a captured evidence log leaks a credential embedded in a URL`, {}, async () => {
  const root = mkdtempSync(join(process.cwd(), ".e2e-defect-redact-"));
  const home = join(root, "pstack");
  const checkout = join(root, "checkout");
  const previous = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = home;
  try {
    mkdirSync(home, { recursive: true });
    initFixtureRepo(checkout, "https://github.com/loopback-owner/lemn-disposable.git");
    const leaked = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const script = `process.stdout.write(['https://${leaked}@github.com/owner/name.git','bare ${leaked}','GITHUB_TOKEN=${leaked}','Authorization: Bearer ${leaked}'].join('\\n'))`;
    const command = ["node", "-e", script];
    writeVerificationPolicy(home, [command]);
    const repoId = fingerprint(checkout, "committed").repoId;
    const ledger = await verify(checkout, {
      id: "e2e-redaction", revision: 1, contractLevel: "minimal", goal: "capture a log",
      scope: { include: ["**"], exclude: [], repoId }, contextRefs: [], acceptance: [],
      verification: [{ id: "g1", kind: "command", command, sideEffect: "none", category: "behavior", required: true }],
      forbidden: [], standingOrders: [], reportFormat: "task-report-v1",
    });
    const log = readFileSync(protocol().evidence[ledger.evidenceRefs[0]!]!.logPath, "utf8");
    assert.equal(log.includes(leaked), false, `the evidence log still contains the credential: ${log}`);
    assert.match(log, /GITHUB_TOKEN=\[REDACTED\]/);
    assert.match(log, /https:\/\/\[REDACTED\]@github\.com/);
  } finally {
    if (previous === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
