export interface Lease {
    subject: string;
    owner: string;
    token: number;
    expiresAt: number;
}
export declare function claimLease(subject: string, owner: string, ttlMs?: number): Lease;
export declare function renewLease(lease: Lease, ttlMs?: number): Lease;
export declare function assertLease(lease: Lease): void;
export declare function releaseLease(lease: Lease): void;
