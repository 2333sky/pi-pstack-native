import type { ModelConfig, RuntimeConfig } from "./types.js";
export declare const DEFAULT_CONFIG: RuntimeConfig;
export declare const DEFAULT_MODELS: ModelConfig;
export declare function loadConfig(): RuntimeConfig;
export declare function saveConfig(config: RuntimeConfig): void;
export declare function loadModels(): ModelConfig;
export declare function saveModels(config: ModelConfig): void;
