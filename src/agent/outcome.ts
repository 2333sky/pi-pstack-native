/** Determine the terminal outcome of the *latest turn*, not any earlier assistant reply. */
export function evaluateAssistantTurn(messages: readonly unknown[], startIndex: number):
  | { state: "completed"; result: string }
  | { state: "failed" | "cancelled"; reason: string } {
  const latest = messages.slice(startIndex).filter((item): item is {
    role: "assistant"; stopReason?: string; errorMessage?: string; content?: unknown
  } => !!item && typeof item === "object" && (item as {role?: string}).role === "assistant").at(-1);
  if (!latest) return { state: "failed", reason: "Pi completed without an assistant message in the current turn" };
  if (latest.stopReason === "aborted") return { state: "cancelled", reason: latest.errorMessage ?? "Agent run was aborted" };
  if (latest.stopReason === "error" || latest.stopReason === "length" || latest.stopReason === "toolUse" || !latest.stopReason) {
    return { state: "failed", reason: latest.errorMessage ?? `Incomplete Pi assistant turn (${latest.stopReason ?? "missing stopReason"})` };
  }
  if (latest.stopReason !== "stop") return { state: "failed", reason: `Unknown stopReason: ${latest.stopReason}` };
  const result = (Array.isArray(latest.content) ? latest.content : []).filter((part): part is {type: "text"; text: string} =>
    !!part && typeof part === "object" && (part as {type?: string}).type === "text" && typeof (part as {text?: unknown}).text === "string"
  ).map((part) => part.text).join("\n").trim();
  return { state: "completed", result: result || "(child completed without a textual final answer)" };
}
