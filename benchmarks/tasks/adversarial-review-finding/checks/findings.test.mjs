import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const findings = JSON.parse(readFileSync(join(root, "review/findings.json"), "utf8"));

test("the findings artifact carries at least one concrete finding", () => {
  assert.ok(Array.isArray(findings) && findings.length > 0);
});

test("every finding carries a severity, a location, a description and quoted evidence", () => {
  for (const finding of findings) {
    assert.ok(["critical", "high", "medium", "low"].includes(finding.severity), JSON.stringify(finding));
    assert.ok(finding.location.length > 0 && finding.description.length > 0 && finding.evidence.length > 0);
  }
});

test("every finding points at a file that exists", () => {
  for (const finding of findings) {
    const file = finding.location.split(":")[0];
    assert.ok(existsSync(join(root, file)), `${finding.location} does not exist`);
  }
});
