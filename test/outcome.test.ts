import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAssistantTurn } from "../src/agent/outcome.ts";

test("provider errors cannot inherit older assistant output", () => {
  const messages = [
    { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "previous success" }] },
    { role: "user", content: "new task" },
    { role: "assistant", stopReason: "error", errorMessage: "429 API error", content: [{ type: "text", text: "partial" }] },
  ];
  assert.deepEqual(evaluateAssistantTurn(messages, 2), { state: "failed", reason: "429 API error" });
  const missing = evaluateAssistantTurn(messages, 3);
  assert.equal(missing.state, "failed");
  assert.match("reason" in missing ? missing.reason : "", /without an assistant/);
});

test("aborts, truncated outputs and nonterminal tool requests cannot report completed", () => {
  for (const stopReason of ["aborted", "length", "toolUse", undefined, "futureReason"]) {
    const result = evaluateAssistantTurn([{ role: "assistant", stopReason, content: [{ type: "text", text: "partial" }] }], 0);
    assert.notEqual(result.state, "completed");
  }
  assert.equal(evaluateAssistantTurn([{ role: "assistant", stopReason: "aborted" }], 0).state, "cancelled");
});

test("only current successfully stopped turn is accepted", () => {
  const result = evaluateAssistantTurn([
    { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "old" }] },
    { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "new" }] },
  ], 1);
  assert.deepEqual(result, { state: "completed", result: "new" });
});
