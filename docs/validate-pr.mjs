import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const required = ["Why", "What changed", "Scope", "Blast Radius", "Verification"];

export function validatePR(body, state) {
  const errors = [];
  const sections = new Map();
  let current;
  let fence;
  for (const line of body.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) {
      current = heading[1].toLowerCase();
      if (sections.has(current)) errors.push(`duplicate section ${heading[1]}`);
      sections.set(current, "");
    } else if (/^#\s/.test(line)) {
      current = undefined;
    } else if (current) {
      sections.set(current, sections.get(current) + line.trim());
    }
  }
  for (const heading of required) {
    const content = sections.get(heading.toLowerCase());
    if (content === undefined) errors.push(`missing section ${heading}`);
    else if (!content) errors.push(`empty section ${heading}`);
  }
  if (state !== undefined) {
    const fields = {
      isDraft: (value) => typeof value === "boolean",
      base: (value) => typeof value === "string" && value.length > 0,
      parentBranch: (value) => value === null || (typeof value === "string" && value.length > 0),
      trunk: (value) => typeof value === "string" && value.length > 0,
      babysit: (value) => typeof value === "boolean",
      phaseComplete: (value) => typeof value === "boolean",
      ownerFullAutonomy: (value) => typeof value === "boolean",
    };
    for (const [field, valid] of Object.entries(fields)) {
      if (!valid(state?.[field])) errors.push(`invalid state ${field}`);
    }
    if (errors.some((error) => error.startsWith("invalid state"))) return errors;
    if (state.isDraft) errors.push("PR must be ready, not draft");
    const base = state.parentBranch ?? state.trunk;
    if (state.base !== base) errors.push(`PR base must be ${base}`);
    if (state.babysit && !state.phaseComplete && !state.ownerFullAutonomy) {
      errors.push("babysit must wait for phase or stack completion");
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [bodyPath, statePath] = process.argv.slice(2);
  if (!bodyPath) {
    console.error("Usage: node docs/validate-pr.mjs <body.md> [state.json]");
    process.exitCode = 2;
  } else {
    const errors = validatePR(readFileSync(bodyPath, "utf8"), statePath ? JSON.parse(readFileSync(statePath, "utf8")) : undefined);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("PR protocol ok");
    }
  }
}
