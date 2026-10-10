export declare function updateRecord<T extends {
    id: string;
    revision?: number;
}>(kind: "workflow" | "agent", id: string, path: string, change: (record: T) => void, afterSave?: (record: T) => void): T;
