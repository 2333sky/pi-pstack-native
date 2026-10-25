import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fingerprint } from "../src/artifacts/fingerprint.ts";
import { protocol } from "../src/runtime/protocol.ts";
import { redactLogTail, redactSecrets } from "../src/runtime/redact.ts";
import { verify } from "../src/verification/runner.ts";
import { initFixtureRepo, writeVerificationPolicy } from "./e2e/harness.ts";

const GH = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

test("secret redaction keeps the label and removes URL userinfo, bare tokens and bearer values", () => {
  const text = [
    `https://${GH}@github.com/owner/name.git`,
    "https://user:swordfish@github.com/owner/name.git",
    `bare ${GH} token`,
    `GITHUB_TOKEN=${GH}`,
    `Authorization: Bearer ${GH}`,
    "npm_aBcDeFgHiJkLmNoPqRsT",
  ].join("\n");
  const redacted = redactSecrets(text);
  for (const secret of [GH, "swordfish", "npm_aBcDeFgHiJkLmNoPqRsT"]) assert.equal(redacted.includes(secret), false, redacted);
  assert.match(redacted, /^https:\/\/\[REDACTED\]@github\.com/m);
  assert.match(redacted, /^https:\/\/\[REDACTED\]@github\.com\/owner\/name\.git$/m);
  assert.match(redacted, /GITHUB_TOKEN=\[REDACTED\]/);
  assert.match(redacted, /Bearer \[REDACTED\]/);
});

test("a truncated log never starts with half a secret", () => {
  const capped = redactLogTail(`first line\n${"x".repeat(80)}${GH}\nlast line`, 64);
  assert.equal(capped.includes(GH.slice(8)), false, capped);
  assert.equal(capped, "last line");
});

test("a secret written across output chunks never reaches the evidence log", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-redact-chunk-"));
  const home = join(root, "pstack");
  const checkout = join(root, "checkout");
  const previous = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = home;
  try {
    mkdirSync(home, { recursive: true });
    initFixtureRepo(checkout, "https://github.com/loopback-owner/lemn-disposable.git");
    const script = [
      `process.stdout.write(${JSON.stringify(GH.slice(0, 12))})`,
      `setTimeout(() => process.stdout.write(${JSON.stringify(`${GH.slice(12)}\\nhttps://${GH}@github.com/x`)}), 60)`,
    ].join(";");
    const command = ["node", "-e", script];
    writeVerificationPolicy(home, [command]);
    const repoId = fingerprint(checkout, "committed").repoId;
    const ledger = await verify(checkout, {
      id: "chunked-redaction", revision: 1, contractLevel: "minimal", goal: "capture a chunked log",
      scope: { include: ["**"], exclude: [], repoId }, contextRefs: [], acceptance: [],
      verification: [{ id: "g1", kind: "command", command, sideEffect: "none", category: "behavior", required: true }],
      forbidden: [], standingOrders: [], reportFormat: "task-report-v1",
    });
    const log = readFileSync(protocol().evidence[ledger.evidenceRefs[0]!]!.logPath, "utf8");
    assert.equal(log.includes(GH), false, `the evidence log still contains the credential: ${log}`);
    assert.equal(log.includes(GH.slice(12)), false, `the evidence log still contains the credential tail: ${log}`);
    assert.match(log, /https:\/\/\[REDACTED\]@github\.com/);
  } finally {
    if (previous === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
