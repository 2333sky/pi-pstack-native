export const string = (description, extra = {}) => ({ type: "string", ...(description ? { description } : {}), ...extra });
export const boolean = (description) => ({ type: "boolean", ...(description ? { description } : {}) });
export const number = (description, extra = {}) => ({ type: "number", ...(description ? { description } : {}), ...extra });
export const array = (items, description) => ({ type: "array", items, ...(description ? { description } : {}) });
export const object = (properties, required = [], extra = {}) => ({ type: "object", properties, required, additionalProperties: false, ...extra });
export const enums = (values, description) => ({ type: "string", enum: values, ...(description ? { description } : {}) });
