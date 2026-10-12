export async function apply({ copy, module }) {
  copy("mutant/duplicate-effect");
  const { record } = await module("src/effects.mjs");
  record("harden");
}
