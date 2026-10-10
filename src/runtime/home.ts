import { homedir } from "node:os";
import { join } from "node:path";

export function pstackHome(): string {
  return process.env.PSTACK_NATIVE_HOME || join(homedir(), ".pi", "agent", "pstack-native");
}

export const homePath = (...parts: string[]): string => join(pstackHome(), ...parts);
export const workflowPath = (id: string): string => homePath("workflows", `${id}.json`);
export const agentPath = (id: string): string => homePath("agents", `${id}.json`);
export const journalPath = (id: string): string => homePath("journals", `${id}.jsonl`);
export const lockPath = (name: string): string => homePath("locks", `${name}.lock`);
export const worktreeRoot = (): string => homePath("worktrees");
export const childSessionRoot = (): string => homePath("sessions");
export const configPath = (): string => homePath("config.json");
export const modelConfigPath = (): string => homePath("models.json");
export const loopsPath = (): string => homePath("loops", "loops.json");
