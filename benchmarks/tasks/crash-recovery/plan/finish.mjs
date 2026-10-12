export async function apply({ module }) {
  const { record } = await module("src/effects.mjs");
  record("finish");
}
