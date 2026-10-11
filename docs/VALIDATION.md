# Release chain validation record — 2026-10-11

This record covers the release chain only. Package `2333@0.6.0-preview.1`, official Pi SDK 1.1.0, Node 22.19.0, 24.21.0 and 26.0.0. Earlier notes in `ACCEPTANCE.md` and in the replaced version of this file described a different container and left most release steps unrun.

## Reproduce

```bash
npm install
npm run check:release
```

`npm run check:release` runs the source checks, the strict typecheck, the build, the Pi SDK session smoke, the offline benchmark integrity check, and then packs the real tarball, installs it into a clean consumer directory, and loads the installed extension, public JavaScript API and CLI. `npm pack` in this repository runs the same chain through `prepack`, so the tarball is gated when it is created. npm runs no lifecycle for `npm publish ./file.tgz`, so a tarball packed elsewhere carries no gate.

## Results

| Step | Result | Proof boundary |
|---|---|---|
| `npm run check:syntax` | PASS, 79 files | Syntax only |
| `npm run check:package` | PASS | Package policy only |
| `npm run check:parity` | PASS | Declared semantic scope, not source equivalence |
| `npm test` | PASS, 100 tests | Branch behavior, not absence of every defect |
| `npm run check:types` | PASS | Installed Pi SDK and TypeScript, strict, source and tests |
| `npm run build` | PASS | Compiled JavaScript, declarations and CLI |
| `npm run check:host` | PASS | Real AgentSession creation, no provider inference |
| `npm run benchmark:smoke` | PASS | Entry links for real, 20 fixtures validate, no model run |
| `npm run smoke:installed` | PASS | Real tarball installed in a clean consumer, Node 22.19.0 and 24.21.0 |
| `npm publish --dry-run --tag preview` | PASS | Whole publish path, no registry write |
| GitHub Actions run 38156153556 | PASS | Both matrix jobs, on the bootstrap commit |

Both supported CI runtimes pass the whole chain, run locally on Node 22.19.0 and Node 24.21.0 with dependencies installed:

```text
################ NODE v22.19.0 ################
check:release EXIT=0
ℹ tests 100
ℹ pass 100
ℹ fail 0
Pi SDK session creation contract: PASS (no provider inference performed)
Benchmark entry imports validated: 4; link: ok; fixtures: 20. No external model was called.
installed package smoke PASS: .../consumer/node_modules/2333/package.json
install smoke PASS: 2333-0.6.0-preview.1.tgz (226 KiB) installed with @earendil-works/pi-coding-agent@1.1.0 on Node v22.19.0
```

## Defects fixed in this change

1. **Benchmark output path.** The entry helper returned `argv[0]` for an absent flag, so a run without `--output` wrote into a directory named `--agent-dir`. Evidence before the fix: `"results": "/private/tmp/pkgtest/--agent-dir/results.json"`.
2. **Benchmark exit code.** A run that verified 0 of 20 cases printed its summary and exited 0. Now an unverified case, an empty case list, or a blocked runner exits non-zero and prints the reason.
3. **Benchmark import check.** `scripts/check-benchmark.mjs` matched import text with a regular expression. With the `export` keyword stripped from `runnerOnce` in `dist/runner/service.js` it still printed `imports validated: 4` and exited 0, while a real import failed with `does not provide an export named 'runnerOnce'`. It now spawns a child process that imports the entry for real, and the tampered case exits 1.
4. **Benchmark entry detection.** The entry guard compared `import.meta.url` with an unresolved `process.argv[1]`, so running the entry through a symlink ran nothing and exited 0, and Node `--preserve-symlinks-main` did the same. The guard now compares the real paths of both sides, and the regression test covers both invocations.
5. **Standing Orders restore semantics.** `orders.digest` was written by `updateOrders` and read by nobody, so a restored program dispatched instructions that did not match their digest. Dispatch now fails closed with `ORDERS_INTEGRITY_MISMATCH`, and each unit records the orders revision in force when it was dispatched, so a restored program can tell which revision its work ran under. Evidence before the fix: `tampered orders accepted: {"revision":1,"instructions":["TAMPERED RULE"],"digest":"c2304aad..."}`.
6. **Installed package smoke test.** The script existed in `test/` but no script, CI job or publish step ran it, and it never touched the compiled public API or CLI. It now runs through `npm run smoke:installed` from a real tarball, asserts the published file list, imports the public API from `dist/`, and runs the published CLI.
7. **Release gate placement.** The strict typecheck and the smoke checks were not part of packing. `prepublishOnly` does not run for `npm publish ./tarball.tgz`, and npm runs no lifecycle at all for a file publish, so the gate now sits on `prepack`. A tarball created by `npm pack` in this repository is gated. A tarball packed elsewhere is not, and that limit is npm's lifecycle, not a choice here.

## Still not verified here

- Authenticated external model inference. The benchmark harness is offline-verified only, so no model success rate, cost or comparison exists yet.
- Real GitHub PR create and merge against a disposable test repository.
- No `package-lock.json` is committed, so CI installs are not byte-reproducible.
- No operating-system sandbox claim. Allowlists and git worktrees are not isolation boundaries.
