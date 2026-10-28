/** Platform mappings and receipt checks. These never grant merge authority or replace native ledgers. */
export declare const CORE_SKILLS: readonly ["poteto-mode", "architect", "arena", "swarm", "interrogate"];
export declare const CORE_PLAYBOOKS: readonly ["bug-fix", "feature", "autopilot-full", "autopilot-stack", "babysit", "shipping"];
export declare const CORE_RESOURCES: string[];
export type CompatibilityStatus = 'equivalent' | 'adapted-with-deviation' | 'unsupported' | 'not-yet-verified';
export declare const CAPABILITIES: Record<string, {
    status: CompatibilityStatus;
    mapping: string;
    reason: string;
}>;
export declare function requireCapability(name: string): {
    status: CompatibilityStatus;
    mapping: string;
    reason: string;
};
export declare function selectPlaybook(intent: string): string;
export interface ReviewReceipt {
    lane: string;
    actor: string;
    head: string;
    base: string;
    status: 'passed' | 'failed' | 'blocked' | 'inconclusive';
    evidence: string[];
}
export interface Round {
    workflow: string;
    head: string;
    base: string;
    writer: string;
    receipts: ReviewReceipt[];
    requiredLanes: string[];
    checksPassed: boolean;
    unresolvedFindings: number;
    authorization: boolean;
    operatorReserved?: boolean;
    interrupted?: boolean;
    remoteReconciled?: boolean;
    changeKind?: 'initial' | 'major' | 'minor' | 'rebase' | 'conflict';
    priorRound?: Round;
    requestedAction: 'verdict' | 'merge';
    skippedSteps?: {
        step: string;
        reason: string;
    }[];
}
/** Full swarms cover initial/major changes; bounded follow-ups still need fresh independent proof. */
export declare function evaluateRound(round: Round): {
    clean: boolean;
    blockers: string[];
};
export declare function validatePanel(workflow: string, models: string[], judge?: string, options?: {
    independentJudgeSession?: boolean;
    allowRepeatedModels?: boolean;
    allowSingleInterrogate?: boolean;
}): {
    workflow: string;
    models: string[];
    judge: string | undefined;
    modelDiversity: boolean;
    judgeIndependence: string;
    dispatch: string;
    writers: string;
    integration: string;
    evidence: string;
};
