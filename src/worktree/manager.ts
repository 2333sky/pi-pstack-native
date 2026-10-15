import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { worktreeRoot } from "../runtime/home.ts";

const execFileAsync = promisify(execFile);

export interface WorktreeInfo { path: string; branch: string; repoRoot: string; baseRef: string; }

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "call";
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return result.stdout.trim();
}

export async function gitRoot(cwd: string): Promise<string | undefined> {
  try { return await git(cwd, ["rev-parse", "--show-toplevel"]); } catch { return undefined; }
}

export async function createWorktree(cwd: string, ownerId: string, baseRef = "HEAD"): Promise<WorktreeInfo> {
  const repoRoot = await gitRoot(cwd);
  if (!repoRoot) throw new Error(`Worktree isolation requires a Git repository: ${cwd}`);
  const root = worktreeRoot();
  mkdirSync(root, { recursive: true });
  const suffix = safe(ownerId);
  const branch = `pstack-native/${suffix}`;
  const path = resolve(join(root, `${safe(basename(repoRoot))}-${suffix}`));
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing worktree path: ${path}`);
  try {
    await git(repoRoot, ["worktree", "add", "-b", branch, path, baseRef]);
  } catch (error) {
    rmSync(path, { recursive: true, force: true });
    throw error;
  }
  return { path, branch, repoRoot, baseRef };
}

export async function isWorktreeDirty(path: string): Promise<boolean> {
  return (await git(path, ["status", "--porcelain"])) !== "";
}

export async function removeWorktree(info: WorktreeInfo, force = false): Promise<void> {
  if (!existsSync(info.path)) return;
  if (!force && await isWorktreeDirty(info.path)) throw new Error(`Refusing to remove dirty worktree: ${info.path}`);
  await git(info.repoRoot, ["worktree", "remove", ...(force ? ["--force"] : []), info.path]);
}

export async function auditWorktree(info:WorktreeInfo,comparisonBase=info.baseRef):Promise<{path:string;branch:string;comparisonBase:string;baseSha:string;headSha:string;dirty:boolean;ahead:number;merged:boolean}> {
  if(!comparisonBase || comparisonBase.startsWith('-') || !/^[A-Za-z0-9_./-]+$/.test(comparisonBase))throw new Error('Invalid comparison base');
  const headSha=await git(info.path,['rev-parse','HEAD']),baseSha=await git(info.repoRoot,['rev-parse','--verify',`${comparisonBase}^{commit}`]);
  const actualBranch=await git(info.path,['branch','--show-current']);
  if(actualBranch!==info.branch)throw new Error('Worktree branch changed');
  const ahead=Number(await git(info.path,['rev-list','--count',`${baseSha}..${headSha}`]));
  let merged=true;try{await git(info.path,['merge-base','--is-ancestor',headSha,baseSha]);}catch{merged=false;}
  return {path:info.path,branch:actualBranch,comparisonBase,baseSha,headSha,dirty:await isWorktreeDirty(info.path),ahead,merged};
}
