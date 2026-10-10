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
    return { panels: raw.panels, workflows: raw.workflows, version: 1, roles: { ...DEFAULT_MODELS.roles, ...(raw.roles ?? {}) }, thinkingLevel: raw.thinkingLevel ?? DEFAULT_MODELS.thinkingLevel };
}
export function saveModels(config) { writeJsonAtomic(modelConfigPath(), config); }
