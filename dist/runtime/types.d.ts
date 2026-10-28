import type { EvidencePacket } from "../agent/resources.js";
import type { CandidateInput } from "../agent/candidates.js";
import type { TaskBrief, TaskReport, Fingerprint, Usage, Budget, GateStatus } from "../contracts/types.js";
export type WorkflowState = "created" | "running" | "blocked" | "paused" | "completed" | "failed" | "cancelling" | "cancelled";
export type CallState = "pending" | "ready" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "skipped";
export type IsolationMode = "shared" | "worktree" | "readonly";
export type AgentProfileName = "worker" | "reviewer" | "cross-judge" | "scout" | "architect" | "verifier" | "synthesizer" | "integrator" | "poteto-agent" | "comment-sicko";
export interface DurableError {
    code: string;
    message: string;
    retryable: boolean;
    cause?: string;
    occurredAt: string;
}
export interface AgentRecord {
    evidencePackets?: EvidencePacket[];
    candidateInputs?: CandidateInput[];
    brief?: TaskBrief;
    baseline?: Fingerprint;
    report?: TaskReport;
    reportError?: string;
    usage?: Usage;
    thinkingLevel?: ThinkingLevelName;
    budget?: Budget;
    id: string;
    revision?: number;
    parentSessionId?: string;
    workflowId?: string;
    callKey?: string;
    profile: AgentProfileName | string;
    task: string;
    state: "created" | "running" | "completed" | "failed" | "cancelling" | "cancelled";
    model?: string;
    modelSelection?: {
        requested: string;
        effective: string;
        notes: string[];
    };
    cwd: string;
    isolation: IsolationMode;
    worktree?: string;
    branch?: string;
    worktreeRepoRoot?: string;
    worktreeBaseRef?: string;
    sessionFile?: string;
    sessionDir?: string;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    result?: string;
    error?: DurableError;
    attempt: number;
    depth: number;
}
export interface WorkflowCall {
    evidencePackets?: EvidencePacket[];
    brief?: TaskBrief;
    thinkingLevel?: ThinkingLevelName;
    budget?: Budget;
    verification?: {
        status: GateStatus;
        ledgerId?: string;
        reason?: string;
    };
    artifactId?: string;
    report?: TaskReport;
    reportError?: string;
    usage?: Usage;
    key: string;
    profile: AgentProfileName | string;
    task: string;
    state: CallState;
    dependsOn: string[];
    attempt: number;
    model?: string;
    modelSelection?: {
        requested: string;
        effective: string;
        notes: string[];
    };
    isolation?: IsolationMode;
    cwd?: string;
    agentId?: string;
    startedAt?: string;
    finishedAt?: string;
    result?: string;
    error?: DurableError;
}
export interface WorkflowEdge {
    from: string;
    to: string;
}
export interface WorkflowRecord {
    modelNotes?: string[];
    deliveryContract?: "local-dag" | "remote-stack-required";
    schemaVersion?: 2;
    reviewFingerprint?: Fingerprint;
    budget?: Budget;
    verification?: "unknown" | "verified" | "blocked" | "stale";
    id: string;
    revision?: number;
    name?: string;
    type: "single" | "parallel" | "chain" | "graph" | "swarm" | "arena" | "orchestrate" | "review" | "loop";
    state: WorkflowState;
    createdAt: string;
    updatedAt: string;
    parentSessionId?: string;
    parentCwd: string;
    calls: Record<string, WorkflowCall>;
    edges: WorkflowEdge[];
    maxConcurrency: number;
    result?: string;
    error?: DurableError;
    cancelledAt?: string;
    upstreamContext?: {
        pstackVersion: string;
        skill?: string;
        playbook?: string;
    };
}
export interface DispatchRecord {
    id: string;
    owner: string;
    programId: string;
    unitKey: string;
    workflowId: string;
    briefDigest: string;
    ordersRevision?: number;
    state: "committed" | "materialized";
    workflow: WorkflowRecord;
    createdAt: string;
    materializedAt?: string;
}
export interface LoopRecord {
    id: string;
    sessionId: string;
    intervalMs: number;
    task: string;
    enabled: boolean;
    createdAt: string;
    nextRunAt: string;
    lastRunAt?: string;
    missedPolicy: "run-once" | "skip";
}
export interface RuntimeConfig {
    version: 1;
    skillsEnabled: boolean;
    defaultConcurrency: number;
    loopMissedPolicy: "run-once" | "skip";
}
export type ThinkingLevelName = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export interface ModelConfig {
    panels?: Record<string, string[]>;
    workflows?: Record<string, Record<string, string>>;
    version: 1;
    roles: Record<string, string>;
    thinkingLevel: "inherit-parent" | ThinkingLevelName;
    fallbackPolicy?: "disabled" | "same-family";
}
export interface AgentProfile {
    name: AgentProfileName | string;
    description: string;
    tools: string[];
    writable: boolean;
    defaultIsolation: IsolationMode;
    defaultRole: string;
    systemPrompt: string;
}
export interface WorkflowNodeSpec {
    evidencePackets?: EvidencePacket[];
    brief?: TaskBrief;
    thinkingLevel?: ThinkingLevelName;
    budget?: Budget;
    key: string;
    profile?: AgentProfileName | string;
    task: string;
    dependsOn?: string[];
    model?: string;
    isolation?: IsolationMode;
}
export interface WorkflowRunSpec {
    modelNotes?: string[];
    deliveryContract?: "local-dag" | "remote-stack-required";
    contractLevel?: "strict" | "minimal";
    budget?: Budget;
    name?: string;
    type?: WorkflowRecord["type"];
    nodes: WorkflowNodeSpec[];
    maxConcurrency?: number;
    parentSessionId?: string;
    cwd: string;
    pstackVersion?: string;
    skill?: string;
    playbook?: string;
}
