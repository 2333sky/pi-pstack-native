const TIERS = {
  standard: 0,
  promo: 0.02,
};

export function discount(quantity, customer = {}) {
  if (customer.loyal) return TIERS.standard;
  if (quantity >= 100) return TIERS.standard;
  if (quantity >= 20) return TIERS.promo;
  return TIERS.standard;
}

export function tiers() {
  return { ...TIERS };
}
