import type { Fingerprint, Artifact } from '../contracts/types.js';
export declare function git(cwd: string, args: string[]): string;
export declare function fingerprint(cwd: string, kind?: 'working' | 'committed'): Fingerprint;
export declare function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean;
export declare function capture(cwd: string, producer?: string, parents?: string[], kind?: 'working' | 'committed'): Artifact;
