import { homedir } from "node:os";
import { join } from "node:path";
export function pstackHome() {
    return process.env.PSTACK_NATIVE_HOME || join(homedir(), ".pi", "agent", "pstack-native");
}
export const homePath = (...parts) => join(pstackHome(), ...parts);
export const workflowPath = (id) => homePath("workflows", `${id}.json`);
export const agentPath = (id) => homePath("agents", `${id}.json`);
export const journalPath = (id) => homePath("journals", `${id}.jsonl`);
export const lockPath = (name) => homePath("locks", `${name}.lock`);
export const worktreeRoot = () => homePath("worktrees");
export const childSessionRoot = () => homePath("sessions");
export const configPath = () => homePath("config.json");
export const modelConfigPath = () => homePath("models.json");
export const loopsPath = () => homePath("loops", "loops.json");
