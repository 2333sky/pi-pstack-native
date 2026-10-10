/** Canonicalize aliases (symlinks, subdirectories) to their individual checkout, not the shared Git common dir. */
export declare function checkoutIdentity(cwd: string): string;
export declare function writerLockKey(cwd: string): string;
