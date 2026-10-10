import type { DurableError } from "./types.js";
export declare function durableError(code: string, error: unknown, retryable?: boolean): DurableError;
