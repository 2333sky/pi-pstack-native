import type { TaskBrief, Budget } from "../contracts/types.js";
import type { ThinkingLevelName } from "../runtime/types.js";
import { type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRecord, IsolationMode } from "../runtime/types.js";
import { type EvidencePacket } from "./resources.js";
type RunSpec = {
    evidencePackets?: EvidencePacket[];
    brief?: TaskBrief;
    thinkingLevel?: ThinkingLevelName;
    budget?: Budget;
    id?: string;
    workflowId?: string;
    callKey?: string;
    profile: string;
    task: string;
    cwd: string;
    isolation?: IsolationMode;
    model?: string;
    attempt?: number;
    depth?: number;
};
export declare class AgentHost {
    private options;
    constructor(options?: {
        agentDir?: string;
        modelRuntime?: any;
    });
    private live;
    private runs;
    private change;
    private isStopping;
    private finishCancelled;
    private parentDepth;
    private nextDepth;
    get(id: string): AgentRecord | undefined;
    list(): AgentRecord[];
    run(spec: RunSpec, ctx: ExtensionContext): Promise<AgentRecord>;
    start(spec: RunSpec, ctx: ExtensionContext): AgentRecord;
    wait(id: string): Promise<AgentRecord | undefined>;
    send(id: string, message: string): Promise<void>;
    cleanupWorktree(id: string, force?: boolean): Promise<AgentRecord>;
    stop(id: string): Promise<AgentRecord>;
    recover(record: AgentRecord, ctx: ExtensionContext): Promise<AgentRecord>;
    private execute;
}
export {};
