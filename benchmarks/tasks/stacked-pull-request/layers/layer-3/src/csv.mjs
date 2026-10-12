import { byCustomer, summarize } from "./report.mjs";

export function toCsv(rows) {
  const lines = ["customer,total"];
  for (const [customer, total] of Object.entries(byCustomer(rows))) lines.push(`${customer},${total}`);
  lines.push(`all,${summarize(rows).total}`);
  return lines.join("\n");
}
