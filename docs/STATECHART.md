# Statechart on Pi

The `statechart` Skill from pstack 0.15.32 is registered. Its original Skill body and all 26 supporting script/fixture files are pinned to `99b609a72323b70204eab407c622f436e858e112`. The executable scripts live at `skills/statechart/scripts/`; the generated Skill retains the original modeling and evidence rules plus the Pi adapter.

This supersedes the earlier macOS assessment's pending-port decision. That assessment remains a historical environment report, not the result of this Linux validation.

## Tools and commands

```sh
node skills/statechart/scripts/statechart.mjs --help
```

The CLI supports `from-chart`, `from-spec`, comparison and PNG rendering. Run work in a scratch directory outside the source checkout. Inputs and the output folder are real artifacts; inspect the generated summary, chart and stories before claiming a model or code property holds.

The original toolchain supports either existing tools selected with `TLA2TOOLS` and optional `JAVA`, or its mise-based installer. This port does not replace TLC with a mock. The validated external tool set is:

| Component | Version or selection |
|---|---|
| Java | OpenJDK 21; upstream accepts Java 11 or later |
| TLC | Immutable release 1.7.4 |
| TLC SHA-256 | `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| Renderer | `pele@1.8.0`, `@resvg/resvg-js@2.6.2` |

To use an existing installation, set `TLA2TOOLS` to the absolute JAR path and `JAVA` to the Java executable if it is not on PATH. `XDG_CACHE_HOME` selects the renderer cache. First-time PNG rendering installs the pinned renderer packages there and needs network access. Java/TLC and renderer dependencies are not runtime dependencies of the Pi extension itself. Missing tools cause an explicit command error; help/parser checks do not establish that TLC ran.

## Verification

```sh
npm run test:statechart
```

With Java 21, the checksummed TLC 1.7.4 and an isolated renderer cache on Linux/Node 24.19.0, the unchanged upstream suite reported **150 tests: 149 passed, zero failed, one skipped**. It exercised real TLC state graphs, spec/chart conversion, bug/fix comparisons, PNG rendering, filesystem recovery and concurrent runs.

The skipped test is `statechart.mjs finds TLC with the real mise when an untrusted mise.toml is next to the spec and above TMPDIR`: it requires TLC resolved by mise, whereas this run explicitly selected the checked JAR through `TLA2TOOLS`. The explicit-JAR path and the simulated installer/error cases were exercised. This is not a claim to have tested real mise provisioning or every operating system.

CI includes a separate Node 24 / Java 21 statechart job that fetches TLC 1.7.4, verifies the same checksum and runs the upstream suite. Default offline tests also check CLI availability and composite-state transition behavior without fetching Java or renderer packages.

These results establish the toolchain's behavior for its tested fixtures. They do not prove an agent-generated model is faithful to arbitrary application code. The Skill still requires tying model actions to real code, replaying reported bugs on the real surface and reporting what the model leaves out. Real-model orchestration remains a separate evidence tier.
