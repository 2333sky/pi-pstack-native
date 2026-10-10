import type { DurableError } from "./types.ts";

export function durableError(code: string, error: unknown, retryable = false): DurableError {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code,
    message,
    retryable,
    ...(error instanceof Error && error.cause ? { cause: String(error.cause) } : {}),
    occurredAt: new Date().toISOString(),
  };
}
