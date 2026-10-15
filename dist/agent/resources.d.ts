export declare const EVIDENCE_CATEGORIES: readonly ["source-control", "issues", "documents", "team-chat", "observability", "errors", "analytics"];
export type EvidenceCategory = typeof EVIDENCE_CATEGORIES[number];
export interface EvidencePacket {
    category: EvidenceCategory;
    status: 'available' | 'empty' | 'unavailable' | 'inconclusive';
    reason: string;
    items: {
        source: string;
        observedAt: string;
        excerpt: string;
    }[];
}
export declare function validateEvidencePackets(value: unknown): EvidencePacket[];
/** Only the package-owned Markdown registry is exposed; no additional filesystem roots. */
export declare function createResourceTools(skillRoot: string, supplied?: EvidencePacket[]): any[];
