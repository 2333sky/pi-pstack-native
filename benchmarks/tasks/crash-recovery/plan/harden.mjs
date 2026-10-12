export async function apply({ copy, module }) {
  copy("plan/harden");
  const { record } = await module("src/effects.mjs");
  record("harden");
}
