import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJournal, readJson, writeJsonAtomic } from "../src/runtime/store.ts";

test("atomic JSON records and journals round-trip", () => {
  const dir = mkdtempSync(join(process.cwd(), ".pstack-store-"));
  try {
    const file = join(dir, "state", "x.json");
    writeJsonAtomic(file, { a: 1 });
    assert.deepEqual(readJson(file, {}), { a: 1 });
    const journal = join(dir, "journal", "x.jsonl");
    appendJournal(journal, { type: "created", n: 1 });
    appendJournal(journal, { type: "done", n: 2 });
    const lines = readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].type, "created");
    assert.equal(lines[1].type, "done");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
