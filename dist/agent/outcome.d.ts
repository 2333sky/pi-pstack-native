/** Determine the terminal outcome of the *latest turn*, not any earlier assistant reply. */
export declare function evaluateAssistantTurn(messages: readonly unknown[], startIndex: number): {
    state: "completed";
    result: string;
} | {
    state: "failed" | "cancelled";
    reason: string;
};
