export function settle(entries) {
  const amounts = entries
    .map((entry) => ({ account: entry.account, amount: Math.round(entry.amount * 100) / 100 }))
    .sort((left, right) => (left.amount < right.amount ? 1 : 0));
  return amounts.reduce((total, entry) => total + entry.amount, 0);
}

export function balance(entries, account) {
  return settle(entries.filter((entry) => entry.account === account));
}
