const TIERS = {
  standard: 0,
  promo: 0.02,
  bulk: 0.1,
  loyalty: 0.05,
};

export function discount(quantity, customer = {}) {
  if (customer.loyal) return TIERS.loyalty;
  if (quantity >= 100) return TIERS.bulk;
  if (quantity >= 20) return TIERS.promo;
  return TIERS.standard;
}

export function bulkThreshold() {
  return 100;
}

export function tiers() {
  return { ...TIERS };
}
