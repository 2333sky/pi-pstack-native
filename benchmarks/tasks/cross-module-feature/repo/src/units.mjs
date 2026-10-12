const FACTORS = { km: 1000, mi: 1609.344 };

export function unitFactor(unit) {
  const factor = FACTORS[unit];
  if (!factor) throw new Error(`Unknown unit: ${unit}`);
  return factor;
}

export function toMeters(value, unit) {
  return value * unitFactor(unit);
}

export function units() {
  return Object.keys(FACTORS);
}
