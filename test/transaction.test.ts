import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { updateRecord } from "../src/runtime/transaction.ts";
import { readJson } from "../src/runtime/store.ts";
import { workflowPath } from "../src/runtime/home.ts";
import { WorkflowEngine } from "../src/workflow/engine.ts";

const run = promisify(execFile);
test("state lock prevents lost read-modify-write between independent OS processes", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-tx-"));
  const before = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = root;
  try {
    const file = join(root, "counter.json");
    writeFileSync(file, JSON.stringify({ id: "one", value: 0, revision: 0 }));
    const tx = new URL("../src/runtime/transaction.ts", import.meta.url).pathname;
    const worker = `import { updateRecord } from ${JSON.stringify(tx)};\n` +
      `const file=process.argv[1]; for(let i=0;i<35;i++) updateRecord('workflow','one',file,(r)=>{r.value++;});`;
    await Promise.all(Array.from({length:4}, () => run(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", worker, file],
      { env: { ...process.env, PSTACK_NATIVE_HOME: root } })));
    const result = readJson<{ value: number; revision: number }>(file, { value: -1, revision: -1 });
    assert.equal(result.value, 140);
    assert.equal(result.revision, 140);
  } finally {
    if (before === undefined) delete process.env.PSTACK_NATIVE_HOME;
    else process.env.PSTACK_NATIVE_HOME = before;
    rmSync(root, {recursive: true, force: true});
  }
});

test("independent processes update one durable workflow record without stale status reads", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-wf-processes-"));
  const before = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = root;
  try {
    const engine = new WorkflowEngine({} as never);
    const workflow = engine.create({ cwd: process.cwd(), nodes: [{ key: "a", task: "cross-process state" }] });
    const file = workflowPath(workflow.id);
    const tx = new URL("../src/runtime/transaction.ts", import.meta.url).pathname;
    const worker = `import { updateRecord } from ${JSON.stringify(tx)};\n` +
      `const file=process.argv[1], id=process.argv[2]; for(let i=0;i<25;i++) updateRecord('workflow',id,file,(r)=>{r.state='running';r.calls.a.attempt++;});`;
    await Promise.all(Array.from({ length: 4 }, () => run(process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", worker, file, workflow.id],
      { env: { ...process.env, PSTACK_NATIVE_HOME: root } })));
    const observed = engine.get(workflow.id)!;
    assert.equal(observed.state, "running");
    assert.equal(observed.calls.a.attempt, 100);
    assert.equal(observed.revision, 100);
  } finally {
    if (before === undefined) delete process.env.PSTACK_NATIVE_HOME;
    else process.env.PSTACK_NATIVE_HOME = before;
    rmSync(root, { recursive: true, force: true });
  }
});
