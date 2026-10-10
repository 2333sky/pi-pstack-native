export function durableError(code, error, retryable = false) {
    const message = error instanceof Error ? error.message : String(error);
    return {
        code,
        message,
        retryable,
        ...(error instanceof Error && error.cause ? { cause: String(error.cause) } : {}),
        occurredAt: new Date().toISOString(),
    };
}
