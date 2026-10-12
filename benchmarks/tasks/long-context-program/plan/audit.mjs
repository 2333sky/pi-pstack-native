export async function apply({ read }) {
  const index = read("src/index.mjs");
  if (!index.includes("modules")) throw new Error("the module index is missing");
}
