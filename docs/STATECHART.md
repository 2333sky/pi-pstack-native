# Statechart on Pi

The active Skill and TypeScript statechart source are pinned to pstack 0.15.36 at `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`. The upstream runtime and test corpus are installed under `skills/statechart/scripts/`. The build compiles the 0.15.36 runtime to `dist/statechart/`, since Node does not strip TypeScript inside `node_modules`; the older 0.15.32 `.mjs` CLI is retained for compatibility.

For the active version, provide a TLA+ specification and configuration:

```sh
node dist/statechart/statechart.js SPEC.tla --config SPEC.cfg --out OUTPUT
```

The output includes `report.md` and, where applicable, `chart.mmd`. Java 11 or later and TLC are external prerequisites. Set `TLA2TOOLS` to a local `tla2tools.jar` and optionally `JAVA` to the Java executable. Without `TLA2TOOLS`, upstream attempts installation through `mise` and the network. Missing prerequisites are errors, not evidence of a successful run. See the Skill's `references/render.md` for optional rendering.

`npm run test:statechart` runs the upstream TypeScript suite, including the pinned corpus. Some tests require Java, TLC and a working process-inspection environment. Tests that report a skip are not live-TLC evidence. CI runs a real-TLC smoke in addition to deterministic checks; consult the actual CI run for its result. Neither a successful toolchain test nor a generated model proves that an arbitrary application's code matches the model.
