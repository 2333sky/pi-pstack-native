# Locked dependency review

`package-lock.json` was generated in this worktree with Node `24.21.0` and npm `11.12.1`. Node 24 is an LTS line supported by the package's `>=22.19.0` engine range. The initial `npm install` used the host Node `26.0.0`. The lock was then regenerated with Node 24.

```bash
npx --yes --package=node@24 --package=npm@11.12.1 -c 'node --version; npm --version; npm install --package-lock-only'
npm ci --no-audit --no-fund
```

The lock resolves these direct runtime and development packages.

| Package | Version | License |
|---|---|---|
| `@earendil-works/pi-coding-agent` | `1.1.0` | MIT |
| `@earendil-works/pi-agent-core` | `1.1.0` | MIT |
| `@earendil-works/pi-ai` | `1.1.0` | MIT |
| `@types/node` | `22.20.5` | MIT |
| `typescript` | `5.9.3` | Apache-2.0 |

The peer range remains `^1.1.0`. The lock fixes this checkout's SDK to `1.1.0`. A downstream consumer can resolve a different compatible SDK version.

## License inventory

All 147 dependency entries in the lock declare a license. This count includes optional packages for other platforms. npm audited 123 installed packages including this project.

| Declared license | Locked entries |
|---|---:|
| MIT | 86 |
| Apache-2.0 | 37 |
| BSD-3-Clause | 13 |
| ISC | 7 |
| BlueOak-1.0.0 | 2 |
| 0BSD | 1 |
| Unlicense | 1 |

These are permissive license declarations. This is a manifest review, not a legal opinion or a source-level license audit. Keep each dependency's license and notices when redistributing its code. No `node_modules` files belong in the commit. Upstream pstack attribution remains in [NOTICE.md](../NOTICE.md) and [PARITY.md](../PARITY.md).

## CI composition

Replace `run: npm install --no-audit --no-fund` in `.github/workflows/ci.yml` with `run: npm ci --no-audit --no-fund`. Keep the existing Node `22.19.0` and `24.x` matrix. Add `node --test docs/parity.test.mjs` to the repository check chain, or add a separate CI step if the root does not wire a package script. The lock and manifest must remain in sync.
