import type { Fingerprint, Artifact, BaselineOwner } from '../contracts/types.js';
export declare function git(cwd: string, args: string[]): string;
export declare function fingerprint(cwd: string, kind?: 'working' | 'committed'): Fingerprint;
export declare function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean;
type CapturePurpose = {
    kind: 'baseline';
    owner: BaselineOwner;
} | {
    kind: 'verification';
    baseline?: Fingerprint;
};
export declare function ownerOf(brief: {
    id: string;
    revision: number;
}, extra?: {
    workflowId?: string;
    callKey?: string;
}): BaselineOwner;
export type BaselineResolution = {
    kind: 'ok';
    fingerprint: Fingerprint;
} | {
    kind: 'unknown';
} | {
    kind: 'unowned';
};
export declare function resolveBaseline(before: Fingerprint, consumer?: BaselineOwner): BaselineResolution;
export declare function capture(cwd: string, producer: string | undefined, parents: string[], kind: 'working' | 'committed', purpose: CapturePurpose): Artifact;
export {};
