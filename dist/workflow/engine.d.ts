import { type EvidencePacket } from "../agent/resources.js";
import type { TaskBrief, Budget } from "../contracts/types.js";
import type { ThinkingLevelName } from "../runtime/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRecord, WorkflowCall, WorkflowRecord, WorkflowRunSpec } from "../runtime/types.js";
export interface AgentRunner {
    run(spec: {
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
        isolation?: WorkflowCall["isolation"];
        model?: string;
        attempt?: number;
    }, ctx: ExtensionContext): Promise<AgentRecord>;
    get(id: string): AgentRecord | undefined;
    stop(id: string): Promise<AgentRecord>;
    recover(record: AgentRecord, ctx: ExtensionContext): Promise<AgentRecord>;
}
export declare class WorkflowEngine {
    private running;
    private notifyOnTerminal;
    private readonly agents;
    private readonly onTerminal?;
    constructor(agents: AgentRunner, onTerminal?: (record: WorkflowRecord) => void);
    create(spec: WorkflowRunSpec): WorkflowRecord;
    get(id: string): WorkflowRecord | undefined;
    list(sessionId?: string): WorkflowRecord[];
    /** Read, mutate and journal under one short lock; never save a stale snapshot. */
    private change;
    start(id: string, ctx: ExtensionContext): WorkflowRecord;
    run(id: string, ctx: ExtensionContext): Promise<WorkflowRecord>;
    pause(id: string): WorkflowRecord;
    resume(id: string, ctx: ExtensionContext): WorkflowRecord;
    private finishCancellation;
    cancel(id: string): Promise<WorkflowRecord>;
    retry(id: string, key: string): WorkflowRecord;
    recoverSession(sessionId: string, ctx: ExtensionContext): WorkflowRecord[];
    private execute;
    acceptedWorkflow(record: WorkflowRecord): boolean;
    accepted(call: WorkflowCall): boolean;
    verifyCall(id: string, key: string, agent: AgentRecord): Promise<void>;
    reviseBrief(id: string, key: string, brief: TaskBrief, actor: string, reason: string): WorkflowRecord;
    private artifactPlan;
    /** Resolve the most recent actual writer of one artifact lane, even through synthesizer nodes. */
    private artifactWorkspace;
    private executionTarget;
    private taskWithDependencies;
}
