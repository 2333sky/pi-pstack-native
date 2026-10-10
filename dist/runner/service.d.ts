export interface RunnerConfig {
    agentDir: string;
    model: string;
    workflowIds: string[];
    pollMs?: number;
}
export declare function runnerOnce(config: RunnerConfig): Promise<unknown[]>;
export declare function runService(configPath: string, once?: boolean, signal?: AbortSignal): Promise<void>;
