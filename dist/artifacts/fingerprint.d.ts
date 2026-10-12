import type { Fingerprint, Artifact } from '../contracts/types.js';
export declare function git(cwd: string, args: string[]): string;
export declare function fingerprint(cwd: string, kind?: 'working' | 'committed'): Fingerprint;
export declare function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean;
type CapturePurpose = {
    kind: 'baseline';
} | {
    kind: 'verification';
    baseline?: Fingerprint;
};
export declare function capturedBaseline(before: Fingerprint): Fingerprint | undefined;
export declare function capture(cwd: string, producer?: string, parents?: string[], kind?: 'working' | 'committed', purpose?: CapturePurpose): Artifact;
export {};
