/** Determine the terminal outcome of the *latest turn*, not any earlier assistant reply. */
export function evaluateAssistantTurn(messages, startIndex) {
    const latest = messages.slice(startIndex).filter((item) => !!item && typeof item === "object" && item.role === "assistant").at(-1);
    if (!latest)
        return { state: "failed", reason: "Pi completed without an assistant message in the current turn" };
    if (latest.stopReason === "aborted")
        return { state: "cancelled", reason: latest.errorMessage ?? "Agent run was aborted" };
    if (latest.stopReason === "error" || latest.stopReason === "length" || latest.stopReason === "toolUse" || !latest.stopReason) {
        return { state: "failed", reason: latest.errorMessage ?? `Incomplete Pi assistant turn (${latest.stopReason ?? "missing stopReason"})` };
    }
    if (latest.stopReason !== "stop")
        return { state: "failed", reason: `Unknown stopReason: ${latest.stopReason}` };
    const result = (Array.isArray(latest.content) ? latest.content : []).filter((part) => !!part && typeof part === "object" && part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
    return { state: "completed", result: result || "(child completed without a textual final answer)" };
}
