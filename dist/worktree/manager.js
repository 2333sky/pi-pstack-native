import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { worktreeRoot } from "../runtime/home.js";
const execFileAsync = promisify(execFile);
function safe(value) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "call";
}
async function git(cwd, args) {
    const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return result.stdout.trim();
}
export async function gitRoot(cwd) {
    try {
        return await git(cwd, ["rev-parse", "--show-toplevel"]);
    }
    catch {
        return undefined;
    }
}
export async function createWorktree(cwd, ownerId, baseRef = "HEAD") {
    const repoRoot = await gitRoot(cwd);
    if (!repoRoot)
        throw new Error(`Worktree isolation requires a Git repository: ${cwd}`);
    const root = worktreeRoot();
    mkdirSync(root, { recursive: true });
    const suffix = safe(ownerId);
    const branch = `pstack-native/${suffix}`;
    const path = resolve(join(root, `${safe(basename(repoRoot))}-${suffix}`));
    if (existsSync(path))
        throw new Error(`Refusing to overwrite existing worktree path: ${path}`);
    try {
        await git(repoRoot, ["worktree", "add", "-b", branch, path, baseRef]);
    }
    catch (error) {
        rmSync(path, { recursive: true, force: true });
        throw error;
    }
    return { path, branch, repoRoot, baseRef };
}
export async function isWorktreeDirty(path) {
    return (await git(path, ["status", "--porcelain"])) !== "";
}
export async function removeWorktree(info, force = false) {
    if (!existsSync(info.path))
        return;
    if (!force && await isWorktreeDirty(info.path))
        throw new Error(`Refusing to remove dirty worktree: ${info.path}`);
    await git(info.repoRoot, ["worktree", "remove", ...(force ? ["--force"] : []), info.path]);
}
