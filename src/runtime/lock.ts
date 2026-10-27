import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

const DEFAULT_STALE_MS = 15 * 60_000;

type LockIdentity = { dev: number; ino: number };
function identity(path: string): LockIdentity | undefined {
  try { const st = lstatSync(path); return { dev: st.dev, ino: st.ino }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
function sameIdentity(a: LockIdentity, b: LockIdentity | undefined): boolean {
  return Boolean(b && a.dev === b.dev && a.ino === b.ino);
}

export class FileLock {
  private fd: number | undefined;
  private owner: string | undefined;
  private heldIdentity: LockIdentity | undefined;
  readonly path: string;
  readonly staleMs: number;
  constructor(path: string, staleMs = DEFAULT_STALE_MS) { this.path = path; this.staleMs = staleMs; }

  acquire(): boolean {
    if (this.fd !== undefined) return true;
    mkdirSync(dirname(this.path), { recursive: true });
    this.clearStale();
    let fd: number;
    try { fd = openSync(this.path, "wx", 0o600); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Windows can report EPERM while another process's deleted lock is still pending removal.
      // Treat it as contention; callers already impose a bounded retry or return busy.
      if (code === "EEXIST" || (process.platform === "win32" && code === "EPERM")) return false;
      throw error;
    }
    const owner = randomUUID();
    const stat = fstatSync(fd);
    const held = { dev: stat.dev, ino: stat.ino };
    try {
      writeFileSync(fd, JSON.stringify({ pid: process.pid, owner, at: new Date().toISOString() }));
      this.fd = fd;
      this.owner = owner;
      this.heldIdentity = held;
      return true;
    } catch (error) {
      closeSync(fd);
      if (sameIdentity(held, identity(this.path))) unlinkSync(this.path);
      throw error;
    }
  }

  release(): void {
    // A failed contender never owns the lock, and must not unlink another owner's file.
    if (this.fd === undefined || !this.owner || !this.heldIdentity) return;
    const held = this.heldIdentity;
    const owner = this.owner;
    try {
      if (sameIdentity(held, identity(this.path))) {
        const onDisk = JSON.parse(readFileSync(this.path, "utf8")) as { owner?: unknown };
        if (onDisk.owner === owner && sameIdentity(held, identity(this.path))) unlinkSync(this.path);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    } finally {
      closeSync(this.fd);
      this.fd = undefined;
      this.owner = undefined;
      this.heldIdentity = undefined;
    }
  }

  private clearStale(): void {
    const initial = identity(this.path);
    if (!initial) return;
    try {
      const raw = readFileSync(this.path, "utf8");
      const pid = Number((JSON.parse(raw) as { pid?: unknown }).pid);
      if (Number.isSafeInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          return; // Live owner, even when older than the stale threshold.
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== "ESRCH") return; // EPERM and unknown failures do not prove death.
          if (sameIdentity(initial, identity(this.path))) unlinkSync(this.path); // Dead owner.
          return;
        }
      }
      // Incomplete lock creation or a malformed legacy lock: apply a conservative age limit.
      const age = Date.now() - statSync(this.path).mtimeMs;
      if (age >= this.staleMs && sameIdentity(initial, identity(this.path))) unlinkSync(this.path);
    } catch { /* Concurrent lock modification: fail closed. */ }
  }
}

export async function withFileLock<T>(path: string, fn: () => Promise<T> | T): Promise<T> {
  const lock = new FileLock(path);
  if (!lock.acquire()) throw new Error(`Resource is locked: ${path}`);
  try { return await fn(); } finally { lock.release(); }
}
