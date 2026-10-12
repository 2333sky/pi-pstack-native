import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprint } from "../../src/artifacts/fingerprint.ts";
import { GitHubCLI } from "../../src/delivery/provider.ts";
import { refresh, eligibility, ship } from "../../src/delivery/frontier.ts";
import { LIVE } from "../e2e/harness.ts";
import { liveTier } from "./guard.ts";

const read = liveTier("read");
const write = liveTier("write");

test(`${LIVE} reads the operator-named repository and its pull request state through gh`, { skip: read.skip, timeout: 300_000 }, async () => {
  if (!read.open) return;
  const target = read;
  const provider = new GitHubCLI();
  assert.equal(target.open, true);
  if (target.pr) {
    const pr = await provider.read(target.repo, target.pr);
    assert.equal(pr.repo, target.repo);
    assert.match(pr.headSha, /^[0-9a-f]{40}$/);
    assert.match(pr.baseSha, /^[0-9a-f]{40}$/);
    const spec = { id: "live-read", repoId: fingerprint(target.clone ?? process.cwd()).repoId, repo: target.repo, numbers: [target.pr], owner: "live-operator" };
    const frontier = await refresh(spec, provider);
    assert.equal(frontier.prs[0]!.repo, target.repo);
    const plan = await ship(spec, provider) as { dryRun?: boolean };
    assert.equal(plan.dryRun, true);
    assert.equal(Array.isArray(eligibility(frontier)), true);
    return;
  }
  const head = await provider.branchHead(target.repo, target.base);
  assert.match(head, /^[0-9a-f]{40}$/);
});

test(`${LIVE} verifies a live pull request from an operator clone and closes it again`, { skip: write.skip, timeout: 600_000 }, async () => {
  if (!write.open) return;
  const target = write;
  const provider = new GitHubCLI();
  const clone = target.clone;
  const branch = `pstack-e2e-${Date.now()}`;
  const bodyFile = join(mkdtempSync(join(tmpdir(), "pstack-e2e-live-")), "body.md");
  writeFileSync(bodyFile, `Live release gate probe for ${target.repo}.\n`);
  let number: number | undefined;
  const run = (args: string[]) => execFileSync("git", ["-C", clone, ...args], { encoding: "utf8" }).trim();
  try {
    run(["checkout", "-q", target.base]);
    run(["checkout", "-q", "-b", branch]);
    writeFileSync(join(clone, "PSTACK-E2E-LIVE.md"), `probe ${branch}\n`);
    run(["add", "PSTACK-E2E-LIVE.md"]);
    run(["commit", "-qm", "pstack e2e live probe"]);
    const headSha = run(["rev-parse", "HEAD"]);
    run(["push", "-q", "origin", `HEAD:refs/heads/${branch}`]);
    const url = await provider.open(target.repo, target.base, branch, `pstack e2e live probe ${branch}`, bodyFile);
    number = Number(url.match(/\/pull\/(\d+)$/)?.[1]);
    assert.ok(Number.isSafeInteger(number), `expected a pull request number from ${url}`);
    const pr = await provider.read(target.repo, number!);
    assert.equal(pr.headSha, headSha);
    assert.equal(pr.baseRef, target.base);
    assert.equal(["passed", "failed", "pending", "unknown"].includes(pr.ci), true);
    assert.equal(["approved", "changes-requested", "pending"].includes(pr.review), true);
  } finally {
    if (number) execFileSync("gh", ["pr", "close", String(number), "--repo", target.repo, "--delete-branch"], { encoding: "utf8" });
    try { run(["push", "-q", "origin", "--delete", branch]); } catch { /* the branch is removed with the pull request */ }
    run(["checkout", "-q", target.base]);
    rmSync(join(clone, "PSTACK-E2E-LIVE.md"), { force: true });
  }
});
