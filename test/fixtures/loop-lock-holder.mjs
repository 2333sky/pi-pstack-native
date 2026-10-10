import { existsSync, writeFileSync } from "node:fs";
import { FileLock } from "../../src/runtime/lock.ts";
import { lockPath } from "../../src/runtime/home.ts";

const lockedPath = process.env.PSTACK_TEST_LOCKED_FILE;
const releasePath = process.env.PSTACK_TEST_RELEASE_LOCK_FILE;
const releasedPath = process.env.PSTACK_TEST_RELEASED_FILE;
if (!lockedPath || !releasePath || !releasedPath) throw new Error("missing lock-holder control file paths");
const lock = new FileLock(lockPath("loops"));
if (!lock.acquire()) throw new Error("test lock holder failed to acquire the loop state lock");
let released = false;
const keepAlive = setInterval(() => {
  if (released || !existsSync(releasePath)) return;
  released = true;
  lock.release();
  writeFileSync(releasedPath, "released");
  clearInterval(keepAlive);
  process.exit(0);
}, 10);
writeFileSync(lockedPath, "locked");
process.stdout.write("LOCKED\n");

process.on("SIGTERM", () => {
  try { lock.release(); }
  catch (error) {
    process.stderr.write(`test lock release failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
  clearInterval(keepAlive);
  process.exit();
});
