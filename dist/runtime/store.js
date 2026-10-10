import { closeSync, fsyncSync, openSync, appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pstackHome } from "./home.js";
export function ensureHome() {
    for (const dir of ["workflows", "agents", "journals", "locks", "worktrees", "sessions", "loops", "receipts"]) {
        mkdirSync(join(pstackHome(), dir), { recursive: true });
    }
}
export function readJson(path, fallback) {
    if (!existsSync(path))
        return structuredClone(fallback);
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return structuredClone(fallback);
    }
}
export function writeJsonAtomic(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    const fd = openSync(temp, "r");
    try {
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    renameSync(temp, path);
    // Persist the rename on filesystems supporting directory fsync.
    try {
        const dirFd = openSync(dirname(path), "r");
        try {
            fsyncSync(dirFd);
        }
        finally {
            closeSync(dirFd);
        }
    }
    catch (error) {
        if (!["EINVAL", "ENOTSUP", "EBADF", "EPERM"].includes(error.code ?? ""))
            throw error;
    }
}
export function appendJournal(path, event) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { encoding: "utf8", mode: 0o600 });
}
export function listJson(dir) {
    if (!existsSync(dir))
        return [];
    const result = [];
    for (const name of readdirSync(dir)) {
        if (!name.endsWith(".json"))
            continue;
        try {
            result.push(JSON.parse(readFileSync(join(dir, name), "utf8")));
        }
        catch { /* corrupted records are surfaced by higher-level validation */ }
    }
    return result;
}
export function removeFile(path) {
    rmSync(path, { force: true });
}
