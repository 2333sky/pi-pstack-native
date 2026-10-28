import { configPath, modelConfigPath } from "./home.js";
import { readJson, writeJsonAtomic } from "./store.js";
export const DEFAULT_CONFIG = {
    version: 1,
    skillsEnabled: true,
    defaultConcurrency: 4,
    loopMissedPolicy: "run-once",
};
export const DEFAULT_MODELS = {
    version: 1,
    thinkingLevel: "inherit-parent",
    fallbackPolicy: "same-family",
    roles: {
        worker: "inherit-parent",
        reviewer: "inherit-parent",
        scout: "inherit-parent",
        architect: "inherit-parent",
        verifier: "inherit-parent",
        synthesizer: "inherit-parent",
        integrator: "inherit-parent",
        "poteto-agent": "inherit-parent",
        "comment-sicko": "inherit-parent",
    },
};
export function loadConfig() {
    const raw = readJson(configPath(), DEFAULT_CONFIG);
    return {
        ...DEFAULT_CONFIG,
        ...raw,
        version: 1,
        defaultConcurrency: Math.max(1, Math.min(16, Number(raw.defaultConcurrency) || DEFAULT_CONFIG.defaultConcurrency)),
    };
}
export function saveConfig(config) { writeJsonAtomic(configPath(), config); }
export function loadModels() {
    const raw = readJson(modelConfigPath(), DEFAULT_MODELS);
    const level = raw.thinkingLevel === undefined ? DEFAULT_MODELS.thinkingLevel : raw.thinkingLevel;
    if (typeof level !== "string" || !["inherit-parent", "off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(level)) {
        throw new Error(`Invalid thinkingLevel in ${modelConfigPath()}; edit it to inherit-parent, off, minimal, low, medium, high, xhigh, or max.`);
    }
    const fallbackPolicy = raw.fallbackPolicy ?? "disabled";
    if (fallbackPolicy !== "disabled" && fallbackPolicy !== "same-family")
        throw new Error(`Invalid fallbackPolicy in ${modelConfigPath()}; use disabled or same-family.`);
    return { panels: raw.panels, workflows: raw.workflows, version: 1, roles: { ...DEFAULT_MODELS.roles, ...(raw.roles ?? {}) }, thinkingLevel: level, fallbackPolicy };
}
export function saveModels(config) { writeJsonAtomic(modelConfigPath(), config); }
