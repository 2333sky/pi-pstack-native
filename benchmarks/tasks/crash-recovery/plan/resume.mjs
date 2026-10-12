export async function apply({ copy, module }) {
  copy("plan/resume");
  const { effects, record } = await module("src/effects.mjs");
  const { RESUMABLE } = await module("src/queue.mjs");
  for (const id of RESUMABLE.filter((id) => id === "resume")) record(id);
  const recorded = effects().filter((id) => id === "resume");
  if (recorded.length !== 1) throw new Error(`recovery duplicated the effect ${recorded.length} times`);
}
