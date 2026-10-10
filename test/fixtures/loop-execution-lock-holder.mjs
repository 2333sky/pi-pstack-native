import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { FileLock } from "../../src/runtime/lock.ts";
import { lockPath } from "../../src/runtime/home.ts";

const sessionId = process.env.PSTACK_TEST_SESSION_ID;
const loopId = process.env.PSTACK_TEST_LOOP_ID;
const lockedPath = process.env.PSTACK_TEST_LOCKED_FILE;
const releasePath = process.env.PSTACK_TEST_RELEASE_LOCK_FILE;
const releasedPath = process.env.PSTACK_TEST_RELEASED_FILE;
if (!sessionId || !loopId || !lockedPath || !releasePath || !releasedPath) {
  throw new Error("missing execution lock holder environment");
}

const key = createHash("sha256").update(`${sessionId}\0${loopId}`).digest("hex");
const lock = new FileLock(lockPath(`loop-run-${key}`));
if (!lock.acquire()) throw new Error("test execution lock holder failed to acquire the loop execution lock");
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
    process.stderr.write(`test execution lock release failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
  clearInterval(keepAlive);
  process.exit();
});
