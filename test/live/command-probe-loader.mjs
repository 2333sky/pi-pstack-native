const WRAPPER = new URL("./command-probe-child.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "node:child_process" && context.parentURL !== WRAPPER) {
    return { url: WRAPPER, format: "module", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
