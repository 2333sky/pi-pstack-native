import { appendFileSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { LoopScheduler } from "../../src/loop/scheduler.ts";

const logPath = process.env.PSTACK_TEST_LOG;
const attemptsPath = process.env.PSTACK_TEST_ATTEMPTS;
const deliveriesPath = process.env.PSTACK_TEST_DELIVERIES;
const readyPath = process.env.PSTACK_TEST_READY_FILE;
const stopPath = process.env.PSTACK_TEST_STOP_FILE;
const stoppedPath = process.env.PSTACK_TEST_STOPPED_FILE;
const releaseDeliveryPath = process.env.PSTACK_TEST_RELEASE_DELIVERY_FILE;
const deliveryReleasedPath = process.env.PSTACK_TEST_DELIVERY_RELEASED_FILE;
const disablePath = process.env.PSTACK_TEST_DISABLE_FILE;
const disabledPath = process.env.PSTACK_TEST_DISABLED_FILE;
const removePath = process.env.PSTACK_TEST_REMOVE_FILE;
const removedPath = process.env.PSTACK_TEST_REMOVED_FILE;
const loopId = process.env.PSTACK_TEST_LOOP_ID;
const mode = process.env.PSTACK_TEST_MODE ?? "deliver";
const sessionId = process.env.PSTACK_TEST_SESSION_ID;
if (!logPath || !attemptsPath || !deliveriesPath || !sessionId || !readyPath || !stopPath || !stoppedPath || !releaseDeliveryPath || !deliveryReleasedPath || !disablePath || !disabledPath || !removePath || !removedPath) {
  throw new Error("missing scheduler worker environment");
}

const appendJson = (path, value) => appendFileSync(path, `${JSON.stringify(value)}\n`);
let attempts = 0;
let releaseHeldDelivery;
const pi = {
  sendUserMessage(content) {
    attempts += 1;
    appendJson(attemptsPath, { at: Date.now(), content });
    if (mode === "faults" && attempts === 1) throw new Error("injected synchronous delivery failure");
    if (mode === "faults" && attempts === 2) return Promise.reject(new Error("injected asynchronous delivery failure"));
    if (mode === "hold") return new Promise((resolve) => {
      releaseHeldDelivery = () => {
        appendJson(deliveriesPath, { at: Date.now(), content });
        resolve();
      };
    });
    appendJson(deliveriesPath, { at: Date.now(), content });
    return Promise.resolve();
  },
};
const ctx = {
  sessionManager: { getSessionId: () => sessionId },
  isIdle: () => true,
};
const scheduler = new LoopScheduler(pi, {
  retryBaseMs: Number(process.env.PSTACK_TEST_RETRY_BASE_MS ?? 40),
  retryMaxMs: Number(process.env.PSTACK_TEST_RETRY_MAX_MS ?? 160),
  logger(message, error) {
    appendJson(logPath, {
      at: Date.now(),
      message,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    });
  },
});

scheduler.start(ctx);
writeFileSync(readyPath, "ready");
const keepAlive = setInterval(() => {
  if (existsSync(stopPath)) {
    unlinkSync(stopPath);
    scheduler.stop();
    writeFileSync(stoppedPath, "stopped");
    process.stdout.write("STOPPED\n");
  }
  if (existsSync(releaseDeliveryPath)) {
    unlinkSync(releaseDeliveryPath);
    releaseHeldDelivery?.();
    releaseHeldDelivery = undefined;
    writeFileSync(deliveryReleasedPath, "released");
    process.stdout.write("DELIVERY-RELEASED\n");
  }
  if (existsSync(disablePath)) {
    unlinkSync(disablePath);
    if (!loopId) throw new Error("loop id is required to disable a scheduled loop");
    const loop = scheduler.setEnabled(sessionId, loopId, false);
    writeFileSync(disabledPath, String(loop.enabled));
  }
  if (existsSync(removePath)) {
    unlinkSync(removePath);
    if (!loopId) throw new Error("loop id is required to remove a scheduled loop");
    writeFileSync(removedPath, String(scheduler.remove(sessionId, loopId)));
  }
}, 5);
process.on("SIGTERM", () => { scheduler.stop(); clearInterval(keepAlive); process.exit(); });
process.on("SIGINT", () => { scheduler.stop(); clearInterval(keepAlive); process.exit(); });
process.stdout.write("READY\n");
