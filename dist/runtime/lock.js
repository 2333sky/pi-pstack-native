import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
const DEFAULT_STALE_MS = 15 * 60_000;
function identity(path) {
    try {
        const st = lstatSync(path);
        return { dev: st.dev, ino: st.ino };
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
function sameIdentity(a, b) {
    return Boolean(b && a.dev === b.dev && a.ino === b.ino);
}
export class FileLock {
    fd;
    owner;
    heldIdentity;
    path;
    staleMs;
    constructor(path, staleMs = DEFAULT_STALE_MS) { this.path = path; this.staleMs = staleMs; }
    acquire() {
        if (this.fd !== undefined)
            return true;
        mkdirSync(dirname(this.path), { recursive: true });
        this.clearStale();
        let fd;
        try {
            fd = openSync(this.path, "wx", 0o600);
        }
        catch (error) {
            if (error.code === "EEXIST")
                return false;
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
        }
        catch (error) {
            closeSync(fd);
            if (sameIdentity(held, identity(this.path)))
                unlinkSync(this.path);
            throw error;
        }
    }
    release() {
        // A failed contender never owns the lock, and must not unlink another owner's file.
        if (this.fd === undefined || !this.owner || !this.heldIdentity)
            return;
        const held = this.heldIdentity;
        const owner = this.owner;
        try {
            if (sameIdentity(held, identity(this.path))) {
                const onDisk = JSON.parse(readFileSync(this.path, "utf8"));
                if (onDisk.owner === owner && sameIdentity(held, identity(this.path)))
                    unlinkSync(this.path);
            }
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        finally {
            closeSync(this.fd);
            this.fd = undefined;
            this.owner = undefined;
            this.heldIdentity = undefined;
        }
    }
    clearStale() {
        const initial = identity(this.path);
        if (!initial)
            return;
        try {
            const raw = readFileSync(this.path, "utf8");
            const pid = Number(JSON.parse(raw).pid);
            if (Number.isSafeInteger(pid) && pid > 0) {
                try {
                    process.kill(pid, 0);
                    return; // Live owner, even when older than the stale threshold.
                }
                catch (error) {
                    const code = error.code;
                    if (code !== "ESRCH")
                        return; // EPERM and unknown failures do not prove death.
                    if (sameIdentity(initial, identity(this.path)))
                        unlinkSync(this.path); // Dead owner.
                    return;
                }
            }
            // Incomplete lock creation or a malformed legacy lock: apply a conservative age limit.
            const age = Date.now() - statSync(this.path).mtimeMs;
            if (age >= this.staleMs && sameIdentity(initial, identity(this.path)))
                unlinkSync(this.path);
        }
        catch { /* Concurrent lock modification: fail closed. */ }
    }
}
export async function withFileLock(path, fn) {
    const lock = new FileLock(path);
    if (!lock.acquire())
        throw new Error(`Resource is locked: ${path}`);
    try {
        return await fn();
    }
    finally {
        lock.release();
    }
}
