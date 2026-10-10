export declare function ensureHome(): void;
export declare function readJson<T>(path: string, fallback: T): T;
export declare function writeJsonAtomic(path: string, value: unknown): void;
export declare function appendJournal(path: string, event: unknown): void;
export declare function listJson<T>(dir: string): T[];
export declare function removeFile(path: string): void;
