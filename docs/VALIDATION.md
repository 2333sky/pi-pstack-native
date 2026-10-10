# GitHub bootstrap validation record — 2026-10-10

This report describes the local container used to prepare the repository, **not** the earlier environment cited in `ACCEPTANCE.md`.

| Check | Result | Caveat |
|---|---|---|
| `npm run check:syntax` | PASS | 79 source/script files |
| `npm run check:package` | PASS | Package policy only |
| `npm run check:parity` | PASS | Declared semantic scope; not source equivalence |
| `npm run benchmark:smoke` | PASS | Four `.js` imports exist and 20 fixture structures validate; no model run |
| Offline unit/subprocess suite excluding real SDK file | 93/93 PASS | `NODE_OPTIONS=--experimental-strip-types` on Node 22.16.0 |
| `npm run check` without overrides | 92/94 PASS | In this unsupported Node 22.16.0 environment, a child-process TypeScript stripping test timed out and the SDK integration module was unavailable |
| `npm run check:types` and `npm run build` | NOT RUN | TypeScript / Pi SDK dependencies absent |
| Real provider inference, live GitHub PRs, cloud CI | NOT RUN | Explicit external release gates |
| npm dependency lockfile | NOT GENERATED | Network DNS to npm registry returned `EAI_AGAIN` |

**Reproducible unit-only check in older local Node:**

```bash
NODE_OPTIONS=--experimental-strip-types node --test $(find test -maxdepth 1 -name '*.test.ts' ! -name 'real-sdk-integration.test.ts' -print | sort)
```

This is **not** the supported environment: the package specifies Node >=22.19.0. After publication, GitHub Actions should run the full check on Node 22.19.0 and 24.x with dependencies installed. Do not infer green CI or live model correctness from these results.
