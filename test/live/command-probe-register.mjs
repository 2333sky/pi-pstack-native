import { registerHooks } from "node:module";

const WRAPPER = new URL("./command-probe-child.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "node:child_process" && context.parentURL !== WRAPPER) {
      return { url: WRAPPER, format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
