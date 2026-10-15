import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReadOnlyTools } from "../src/agent/read-only-tools.ts";

test("read-only search tools find content and reject paths outside the workspace", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-ro-"));
  const outside = mkdtempSync(join(process.cwd(), ".pstack-out-"));
  try {
    mkdirSync(join(root,"src")); writeFileSync(join(root,"src","a.ts"),"const usefulName = 1;\n");
    writeFileSync(join(outside,"secret.txt"),"secret\n"); symlinkSync(outside,join(root,"escape"));
    const tools = Object.fromEntries(createReadOnlyTools(root).map((t) => [t.name,t]));
    const found = await tools.find.execute("1",{query:"a.ts"});
    assert.match(found.content[0].text,/src\/a\.ts/);
    const grep = await tools.grep.execute("2",{pattern:"usefulName"});
    assert.match(grep.content[0].text,/src\/a\.ts:1/);
    await assert.rejects(() => tools.ls.execute("3",{path:"escape"}), /escapes child workspace/);
  } finally { rmSync(root,{recursive:true,force:true}); rmSync(outside,{recursive:true,force:true}); }
});

test("confined read rejects symlink and absolute paths outside the workspace", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-read-"));
  const outside = mkdtempSync(join(process.cwd(), ".pstack-secret-"));
  try {
    writeFileSync(join(root, "safe.txt"), "hello\nworld");
    writeFileSync(join(outside, "secret"), "token");
    symlinkSync(join(outside, "secret"), join(root, "link"));
    const tools = Object.fromEntries(createReadOnlyTools(root).map((tool) => [tool.name, tool]));
    assert.match((await tools.read.execute("1", { path: "safe.txt" })).content[0].text, /1: hello/);
    await assert.rejects(() => tools.read.execute("2", { path: join(outside, "secret") }), /escapes/);
    await assert.rejects(() => tools.read.execute("3", { path: "link" }), /escapes/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("catastrophic regex runs in a killable worker rather than stalling the main thread", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-redos-"));
  try {
    writeFileSync(join(root, "re.txt"), "a".repeat(90) + "!\n");
    const tools = Object.fromEntries(createReadOnlyTools(root).map((tool) => [tool.name, tool]));
    const before = Date.now();
    await assert.rejects(() => tools.grep.execute("1", { pattern: "(a+)+$" }), /exceeded.*limit/);
    assert.ok(Date.now() - before < 7000, "regex should not block the main JS thread indefinitely");
    assert.match((await tools.read.execute("2", { path: "re.txt" })).content[0].text, /a+/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("find stops at the traversal bound instead of walking a tree of empty directories", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-walk-"));
  try {
    for (let i = 0; i < 25_000; i++) mkdirSync(join(root, `empty-${i}`));
    const find = createReadOnlyTools(root).find((t) => t.name === "find")!;
    const text = (await find.execute("1", { query: "nothing-matches" })).content[0].text;
    assert.equal(text, "(no matches)\n(walk stopped at the traversal limit; results may be incomplete)");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("find does not descend past the depth limit", async () => {
  const root = mkdtempSync(join(process.cwd(), ".pstack-depth-"));
  try {
    let deep = root; for (let i = 0; i < 40; i++) { deep = join(deep, "d"); mkdirSync(deep); }
    writeFileSync(join(deep, "deep.txt"), "x");
    let near = root; for (let i = 0; i < 3; i++) { near = join(near, "n"); mkdirSync(near); }
    writeFileSync(join(near, "near.txt"), "x");
    const find = createReadOnlyTools(root).find((t) => t.name === "find")!;
    assert.ok(!(await find.execute("1", { query: "deep.txt" })).content[0].text.includes("deep.txt"));
    assert.match((await find.execute("2", { query: "near.txt" })).content[0].text, /near\.txt/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
