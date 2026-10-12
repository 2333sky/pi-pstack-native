export function summarize(rows) {
  return { count: rows.length, total: rows.reduce((sum, row) => sum + row.amount, 0), rows };
}

export function byCustomer(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.customer, (groups.get(row.customer) ?? 0) + row.amount);
  return Object.fromEntries([...groups].sort());
}
