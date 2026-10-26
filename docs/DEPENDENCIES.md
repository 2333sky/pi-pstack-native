# Locked dependency review

The active SDK is `@earendil-works/pi-coding-agent` **1.4.0**, the npm `latest` release checked on 2026-10-26. Development uses the exact version and the peer minimum is `^1.4.0`. `package-lock.json` pins the SDK and its dependency graph; `npm ci` reproduces it. The supported Node range stays `>=22.19.0`, matching the SDK.

| Package | Locked version | Declared license |
|---|---|---|
| `@earendil-works/pi-coding-agent` | `1.4.0` | MIT |
| `@earendil-works/pi-agent-core` | `1.4.0` | MIT |
| `@earendil-works/pi-ai` | `1.4.0` | MIT |
| `@types/node` | `22.20.5` | MIT |
| `typescript` | `5.9.3` | Apache-2.0 |

The upgrade was installed and checked on Node 24.19.0 / npm 11.9.0. CI retains Node 22.19.0 and 24.x. SDK lifecycle, source extension loading, compiled API/CLI and a clean installed tarball are separate checks in `npm run check:release`.

## License inventory

The lock contains 120 dependency entries, including optional packages for other platforms.

| Declared license | Locked entries |
|---|---:|
| 0BSD | 1 |
| Apache-2.0 | 37 |
| BSD-3-Clause | 13 |
| BlueOak-1.0.0 | 2 |
| ISC | 7 |
| MIT | 59 |
| Unlicense | 1 |

This inventories package metadata rather than asserting a source-level license audit. Keep upstream notices when redistributing code. No node_modules files are committed.

Statechart's Java/TLC and optional PNG renderer are external tools, not new runtime dependencies of the Pi extension. Their pinned versions and validation boundary are in [STATECHART.md](STATECHART.md).

## Historical compatibility

The earlier 1.1.0 to 1.2.0 upgrade repaired an SDK/codemode import mismatch. That history does not establish support for SDK versions older than the current `^1.4.0` peer range.
