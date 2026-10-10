export type JsonSchema = Record<string, unknown>;
export declare const string: (description?: string, extra?: Record<string, unknown>) => JsonSchema;
export declare const boolean: (description?: string) => JsonSchema;
export declare const number: (description?: string, extra?: Record<string, unknown>) => JsonSchema;
export declare const array: (items: JsonSchema, description?: string) => JsonSchema;
export declare const object: (properties: Record<string, JsonSchema>, required?: string[], extra?: Record<string, unknown>) => JsonSchema;
export declare const enums: (values: string[], description?: string) => JsonSchema;
