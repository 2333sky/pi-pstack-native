export function summarize(rows) {
  return { count: rows.length, total: rows.reduce((sum, row) => sum + row.amount, 0), rows };
}
