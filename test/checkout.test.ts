import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { checkoutIdentity, writerLockKey } from "../src/runtime/checkout.ts";

test("checkout identity collapses nested paths and symlink aliases", () => {
  const base = mkdtempSync(join(process.cwd(), ".pstack-checkout-"));
  const repo = join(base, "repo");
  mkdirSync(repo);
  mkdirSync(join(repo, "sub"));
  symlinkSync(repo, join(base, "alias"), "dir");
  try {
    execFileSync("git", ["init", "-q", repo]);
    assert.equal(checkoutIdentity(join(base, "alias", "sub")), checkoutIdentity(repo));
    assert.equal(writerLockKey(join(repo, "sub")), writerLockKey(repo));
  } finally { rmSync(base, { recursive: true, force: true }); }
});
