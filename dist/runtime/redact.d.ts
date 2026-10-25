export declare function redactSecrets(text: string): string;
/** Redacts the whole buffer first, so a secret split across chunks is still whole when matched. */
export declare function redactLogTail(raw: string, cap: number): string;
