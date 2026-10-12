export async function apply({ read }) {
  const source = read("src/ledger.mjs");
  if (!source.includes("sort(")) throw new Error("the settlement entry sort is missing");
}
