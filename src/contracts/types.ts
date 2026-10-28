export type GateStatus = 'pending' | 'running' | 'passed' | 'failed' | 'blocked' | 'stale';
export interface GateSpec {
  id: string; kind: 'command' | 'file' | 'diff' | 'test-report' | 'human-approval' | 'llm-review';
  required?: boolean; command?: string[]; timeoutSeconds?: number;
  sideEffect?: 'none' | 'local' | 'remote'; path?: string; pattern?: string;
  format?: 'junit' | 'tap'; maxFiles?: number; coverage?: string[];
  category?: 'behavior' | 'typecheck' | 'review';
}
export type TaskBrief = BriefFields & (
  { contractLevel: 'minimal'; acceptance?: Acceptance[] } |
  { contractLevel: 'strict'; acceptance: Acceptance[] }
);
export interface Acceptance { id: string; description: string; required: boolean; gateIds: string[] }
interface BriefFields {
  id: string; revision: number; goal: string;
  scope: { include: string[]; exclude: string[]; repoId: string };
  contextRefs: string[];
  verification: GateSpec[]; timeboxSeconds?: number; forbidden: string[];
  standingOrders: string[]; reportFormat: 'task-report-v1';
  reportRequirements?: {kind:'evaluation'|'cross-evaluation'|'selection'|'ranking'|'review'|'repro-review'|'coverage'; criteria?:string[]; candidates?:string[]; slices?:string[]};
}
export type ReportNote = string | { severity: 'blocking' | 'advisory'; description: string };
export interface TaskReport {
  status: 'completed' | 'blocked' | 'failed'; artifactRefs: string[];
  base: string; head: string; commandsRun: string[][]; evidenceRefs: string[];
  deviations: ReportNote[]; unresolved: ReportNote[]; nextActions: string[];
  evaluation?: {criterion:string;score:number;evidence:string[];weaknesses:string[];selectedParts:string[]}[];
  crossEvaluation?: {candidate:string;criterion:string;score:number;evidence:string[];weaknesses:string[];selectedParts:string[]}[];
  selection?: {candidates:string[];selectedParts:string[]};
  ranking?: {candidate:string;rank:number;reason:string}[];
  findings?: {severity:'critical'|'high'|'medium'|'low';location:string;description:string;evidence:string; reproduction?: {command:string[];observed:string;expected:string}}[];
  coverage?: {completed:string[];unresolved:string[]};
}
export interface Budget { maxTokens?: number; maxCost?: number; maxTimeSeconds?: number }
export interface Usage { tokens: number | null; cost: number | null; elapsedMs: number }
export interface Fingerprint {
  repoId: string; kind: 'working' | 'committed'; commitSha: string; treeSha: string;
  workspaceDigest: string; indexTree: string; policyVersion: 1;
  files: Record<string, string>; dirty: boolean;
}
export interface BaselineOwner { briefId: string; briefRevision: number; workflowId?: string; callKey?: string }
export interface Artifact { id: string; cwd: string; fingerprint: Fingerprint; parents: string[]; producer?: string; owner?: BaselineOwner; createdAt: string }
export interface Evidence {
  id: string; gateId: string; gateDefinitionHash: string; status: GateStatus; reason?: string;
  command?: string[]; cwd: string; exitCode?: number | null; startedAt: string; finishedAt: string;
  artifactId: string; logPath: string; checksum: string; actor: string; environmentHash: string;
}
export interface Ledger {
  id: string; artifactId: string; fingerprint: Fingerprint; evidenceRefs: string[];
  contractAccepted: boolean;
  gateIds: string[]; gateDefinitionHash: string; status: GateStatus;
  verdict: 'unit-test-verified' | 'type-check-only' | 'verifier-blocked' | 'verifier-failed' | 'not-verified';
  verifiedAt: string; verifiedBy: string; executionNonce: string;
  diffBase?: { kind: 'pr' | 'fingerprint'; commitSha: string; fingerprintHash?: string; refreshed: boolean };
  pr?: { repoId: string; number: number; headSha: string; baseSha?: string };
}
export interface Event { id: string; at: string; actor: string; type: string; subject: string; data: unknown }
