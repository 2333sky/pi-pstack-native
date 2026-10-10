import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { FileLock } from "../src/runtime/lock.ts";

test("lock recovers immediately from a dead owner even when the file is fresh", () => {
  const dir = mkdtempSync(join(process.cwd(), ".pstack-lock-"));
  try {
    const path = join(dir, "workflow.lock");
    writeFileSync(path, JSON.stringify({ pid: 2_147_483_647, at: new Date().toISOString() }));
    const lock = new FileLock(path, 60 * 60_000);
    assert.equal(lock.acquire(), true);
    lock.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lock does not steal a lock from a live owner", () => {
  const dir = mkdtempSync(join(process.cwd(), ".pstack-lock-live-"));
  try {
    const path = join(dir, "workflow.lock");
    writeFileSync(path, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    const lock = new FileLock(path, 0);
    assert.equal(lock.acquire(), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("failed lock contender release cannot unlink an active owner's lock", () => {
  const dir = mkdtempSync(join(process.cwd(), ".pstack-lock-contender-"));
  try {
    const path = join(dir, "writer.lock");
    const a = new FileLock(path);
    const b = new FileLock(path);
    assert.equal(a.acquire(), true);
    assert.equal(b.acquire(), false);
    b.release();
    assert.equal(new FileLock(path).acquire(), false, "third writer must not enter");
    a.release();
    const c = new FileLock(path);
    assert.equal(c.acquire(), true);
    c.release();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an old owner's release cannot erase a replacement lock", () => {
  const dir = mkdtempSync(join(process.cwd(), ".pstack-lock-replace-"));
  try {
    const path = join(dir, "writer.lock");
    const old = new FileLock(path);
    assert.equal(old.acquire(), true);
    // Simulate external replacement of the pathname with a different inode.
    rmSync(path);
    writeFileSync(path, JSON.stringify({ pid: process.pid, owner: "another-owner" }));
    old.release();
    const contender = new FileLock(path);
    assert.equal(contender.acquire(), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("EPERM during a liveness probe does not prove the lock owner has died", () => {
  const dir = mkdtempSync(join(process.cwd(), ".pstack-lock-eperm-"));
  const kill = process.kill;
  try {
    const path = join(dir, "writer.lock");
    writeFileSync(path, JSON.stringify({ pid: process.pid, owner: "external" }));
    process.kill = ((pid: number, signal: any) => {
      if (signal === 0) throw Object.assign(new Error("Access denied"), { code: "EPERM" });
      return kill(pid, signal);
    }) as typeof process.kill;
    assert.equal(new FileLock(path).acquire(), false);
  } finally { process.kill = kill; rmSync(dir, { recursive: true, force: true }); }
});
