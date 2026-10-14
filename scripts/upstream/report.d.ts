/** Detection is advisory. No report state authorizes baseline advancement. */
export type GateStatus = 'passed' | 'failed' | 'not_run';
export interface SyncReport {
  schemaVersion: 1;
  source: { repository: 'cursor/plugins'; path: 'pstack' };
  baseline: Snapshot;
  candidate: Snapshot;
  syncId: string;
  changes: Change[];
  nameDrift: Record<'skills' | 'playbooks', { added: string[]; deleted: string[] }>;
  runtimeSeams: { taskId: string; side: 'baseline' | 'candidate'; path: string; line: number; name: string; evidence: string; certainty: 'keyword-hit-needs-review'; mapping: string }[];
  impact: { history_diverged: boolean; manualReviewRequired: boolean; limitations: string[] };
  gates: { command: string; status: GateStatus }[];
  status: 'no_change' | 'changes_detected' | 'blocked';
  lifecycle: 'detected' | 'blocked';
  fingerprint: string;
  generatedAt: string;
}
interface Snapshot { sha: string; version: string; names: { skills: string[]; playbooks: string[] } }
interface Change {
  id: string; path: string; oldPath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldBlob: string | null; newBlob: string | null; oldMode: string | null; newMode: string | null;
  category: 'skill' | 'playbook' | 'reference' | 'script' | 'agent' | 'manifest' | 'docs' | 'other';
  content: { baseline: string; candidate: string }; rawEvidence: string; summary: string;
  localFiles: string[];
  disposition: 'PORT' | 'PI_EQUIVALENT' | 'CURSOR_ONLY' | 'DOC_ONLY' | 'IGNORE_WITH_REASON';
  risk: 'high' | 'medium' | 'low'; manualReview: true; owner: null;
  intent: string; acceptance: string[]; evidenceStatus: 'missing'; taskStatus: 'pending';
}
