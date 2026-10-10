import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

/** Canonicalize aliases (symlinks, subdirectories) to their individual checkout, not the shared Git common dir. */
export function checkoutIdentity(cwd: string): string {
  const canonical = realpathSync(resolve(cwd));
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: canonical, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return realpathSync(root);
  } catch { return canonical; }
}

export function writerLockKey(cwd: string): string {
  return createHash("sha256").update(checkoutIdentity(cwd)).digest("hex").slice(0, 20);
}
