/** Tool and command entrypoints must not expose another Pi session's durable records. */
export function assertSessionOwner(record, sessionId) {
    if (!record || !record.parentSessionId || record.parentSessionId !== sessionId) {
        throw new Error("Record not found in this Pi session.");
    }
}
