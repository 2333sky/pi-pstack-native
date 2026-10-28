import type { TaskBrief, TaskReport, Fingerprint } from './types.js';
export declare function matchPath(path: string, glob: string): boolean;
export declare class BriefValidationError extends Error {
    readonly code = "BRIEF_INCOMPLETE";
    constructor(detail: string);
}
export declare function validateBrief(brief: TaskBrief): void;
export declare function saveBrief(brief: TaskBrief, actor: string, reason: string): TaskBrief;
export declare function changedPaths(before: Fingerprint, after: Fingerprint, cwd: string): string[];
export declare function scopeViolations(brief: TaskBrief, paths: string[]): string[];
export declare function validateReport(value: unknown): TaskReport;
/** Legacy strings and malformed notes remain blocking; only explicit advisory notes pass. */
export declare function hasBlockingReportNotes(report: TaskReport): boolean;
export declare function parseReport(text: string): TaskReport;
export declare function briefPrompt(brief: TaskBrief): string;
export declare function validateBudget(budget?: import('./types.js').Budget): void;
export declare function reportSatisfies(brief: TaskBrief, report: TaskReport): boolean;
/** Synthesis may paraphrase a finding, but its reproduction must appear in a verifier report. */
export declare function findingsBackedByVerifiers(report: TaskReport, verifiers: TaskReport[]): boolean;
