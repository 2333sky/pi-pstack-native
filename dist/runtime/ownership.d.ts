/** Tool and command entrypoints must not expose another Pi session's durable records. */
export declare function assertSessionOwner(record: {
    parentSessionId?: string;
} | undefined, sessionId: string): void;
