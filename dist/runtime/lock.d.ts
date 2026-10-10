export declare class FileLock {
    private fd;
    private owner;
    private heldIdentity;
    readonly path: string;
    readonly staleMs: number;
    constructor(path: string, staleMs?: number);
    acquire(): boolean;
    release(): void;
    private clearStale;
}
export declare function withFileLock<T>(path: string, fn: () => Promise<T> | T): Promise<T>;
