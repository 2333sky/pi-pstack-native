import { toMeters } from "./units.mjs";

export function formatDistance(meters, unit) {
  return `${(meters / toMeters(1, unit)).toFixed(2)} ${unit}`;
}
