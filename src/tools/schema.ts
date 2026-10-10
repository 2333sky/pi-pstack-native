// Pi accepts ordinary JSON Schema objects in addition to TypeBox-tagged schemas.
// Keeping schemas here avoids a runtime dependency on typebox.
export type JsonSchema = Record<string, unknown>;
export const string = (description?: string, extra: Record<string, unknown> = {}): JsonSchema => ({ type: "string", ...(description ? { description } : {}), ...extra });
export const boolean = (description?: string): JsonSchema => ({ type: "boolean", ...(description ? { description } : {}) });
export const number = (description?: string, extra: Record<string, unknown> = {}): JsonSchema => ({ type: "number", ...(description ? { description } : {}), ...extra });
export const array = (items: JsonSchema, description?: string): JsonSchema => ({ type: "array", items, ...(description ? { description } : {}) });
export const object = (properties: Record<string, JsonSchema>, required: string[] = [], extra: Record<string, unknown> = {}): JsonSchema => ({ type: "object", properties, required, additionalProperties: false, ...extra });
export const enums = (values: string[], description?: string): JsonSchema => ({ type: "string", enum: values, ...(description ? { description } : {}) });
