import { count, items } from "./api.mjs";

export function page(records, size) {
  return items(records, { limit: size });
}

export function total(records) {
  return count(records);
}
