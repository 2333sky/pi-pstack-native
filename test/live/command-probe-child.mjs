import { appendFileSync } from "node:fs";
import real from "node:child_process";

const flatten = (value) => Array.isArray(value) ? value.flatMap(flatten) : typeof value === "string" ? [value] : [];

function record(name, args) {
  const file = process.env.PSTACK_E2E_COMMAND_PROBE;
  if (!file) return;
  try { appendFileSync(file, `${JSON.stringify({ name, command: args.flatMap(flatten).join(" ") })}\n`); } catch {}
}

const wrap = (name) => (...args) => { record(name, args); return real[name](...args); };

export const execFileSync = wrap("execFileSync");
export const execFile = wrap("execFile");
export const execSync = wrap("execSync");
export const exec = wrap("exec");
export const spawn = wrap("spawn");
export const spawnSync = wrap("spawnSync");
export const fork = wrap("fork");

export default { ...real, execFileSync, execFile, execSync, exec, spawn, spawnSync, fork };
