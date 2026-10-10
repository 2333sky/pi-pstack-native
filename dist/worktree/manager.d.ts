export interface WorktreeInfo {
    path: string;
    branch: string;
    repoRoot: string;
    baseRef: string;
}
export declare function gitRoot(cwd: string): Promise<string | undefined>;
export declare function createWorktree(cwd: string, ownerId: string, baseRef?: string): Promise<WorktreeInfo>;
export declare function isWorktreeDirty(path: string): Promise<boolean>;
export declare function removeWorktree(info: WorktreeInfo, force?: boolean): Promise<void>;
