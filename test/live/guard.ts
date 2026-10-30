import { execFileSync } from "node:child_process";

export type LiveRequirement = "read" | "write" | "merge";

export interface LiveClosed { open: false; reason: string; skip: string }
export interface LiveOpen { open: true; reason: string; repo: string; base: string; pr?: number; clone?: string; skip: false }
export interface LiveWriteOpen extends LiveOpen { write: true; clone: string }
export type LiveGate = LiveClosed | LiveOpen | LiveWriteOpen;

type LiveTarget =
  | { enabled: true; reason: string; repo: string; base: string; pr?: number; clone?: string; write: boolean; merge: boolean }
  | { enabled: false; reason: string };

const PROTECTED = new Set(["2333sky/pi-pstack-native"]);

function checkoutRepo(cwd = process.cwd()): string | undefined {
  try {
    const remote = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return remote.match(/(?:github\.com[/:])([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1];
  } catch { return undefined; }
}

let probedCheckout: { repo: string | undefined } | undefined;

function currentCheckoutRepo(): string | undefined {
  probedCheckout ??= { repo: checkoutRepo() };
  return probedCheckout.repo;
}

/**
 * The live tier is closed unless the operator names one repository, repeats its name,
 * and supplies a clone for any write. Nothing derives a target from the environment.
 */
function liveTarget(env: NodeJS.ProcessEnv, checkout: string | undefined): LiveTarget {
  const repo = env.PSTACK_E2E_LIVE_REPO ?? "";
  const base = env.PSTACK_E2E_LIVE_BASE ?? "main";
  const clone = env.PSTACK_E2E_LIVE_CLONE;
  const write = env.PSTACK_E2E_LIVE_WRITE === "1";
  const merge = env.PSTACK_E2E_LIVE_MERGE === "1";
  const pr = Number.isSafeInteger(Number(env.PSTACK_E2E_LIVE_PR)) && Number(env.PSTACK_E2E_LIVE_PR) > 0 ? Number(env.PSTACK_E2E_LIVE_PR) : undefined;
  const closed = (reason: string): LiveTarget => ({ enabled: false, reason });
  if (env.PSTACK_E2E_LIVE !== "1") return closed("PSTACK_E2E_LIVE is not set to 1");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return closed("PSTACK_E2E_LIVE_REPO must name one owner/repository explicitly");
  if (env.PSTACK_E2E_LIVE_CONFIRM !== repo) return closed("PSTACK_E2E_LIVE_CONFIRM must repeat the exact repository name");
  if (PROTECTED.has(repo.toLowerCase())) return closed(`${repo} is a protected repository`);
  if (write && !clone) return closed("PSTACK_E2E_LIVE_WRITE requires an explicit PSTACK_E2E_LIVE_CLONE");
  const current = checkout ?? currentCheckoutRepo();
  if (current && current.toLowerCase() === repo.toLowerCase()) return closed("refusing the repository of the current checkout");
  return { enabled: true, reason: "explicitly named by the operator", repo, base, pr, clone, write, merge };
}

export function liveTier(requirement?: "read", env?: NodeJS.ProcessEnv, checkout?: string): LiveClosed | LiveOpen;
export function liveTier(requirement: "write", env?: NodeJS.ProcessEnv, checkout?: string): LiveClosed | LiveWriteOpen;
export function liveTier(requirement: "merge", env?: NodeJS.ProcessEnv, checkout?: string): LiveClosed | LiveWriteOpen;
export function liveTier(requirement: LiveRequirement = "read", env: NodeJS.ProcessEnv = process.env, checkout?: string): LiveGate {
  const target = liveTarget(env, checkout);
  if (!target.enabled) return { open: false, reason: target.reason, skip: `live tier closed: ${target.reason}` };
  const open = {
    open: true as const,
    reason: target.reason,
    repo: target.repo,
    base: target.base,
    ...(target.pr === undefined ? {} : { pr: target.pr }),
    ...(target.clone === undefined ? {} : { clone: target.clone }),
  };
  if (requirement === "read") return { ...open, skip: false as const };
  if (!target.write || !target.clone) return { open: false, reason: "PSTACK_E2E_LIVE_WRITE is not set to 1", skip: "requires PSTACK_E2E_LIVE_WRITE=1 with an explicit PSTACK_E2E_LIVE_CLONE" };
  if (requirement === "merge" && !target.merge) return { open: false, reason: "PSTACK_E2E_LIVE_MERGE is not set to 1", skip: "requires PSTACK_E2E_LIVE_MERGE=1 in addition to PSTACK_E2E_LIVE_WRITE=1" };
  return { ...open, write: true as const, clone: target.clone, skip: false as const };
}
