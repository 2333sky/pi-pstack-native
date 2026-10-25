# statechart port assessment

Date 2026-10-25. Target `cursor/plugins` `99b609a72323b70204eab407c622f436e858e112`, pstack `0.15.32`.

This note records the first milestone of the `statechart` work package. It does not register the skill. `PARITY.json` keeps `statechart` in `coverage.pendingTargetSkills`.

## What the skill is

`statechart` draws how a system moves between states as a Mermaid statechart built from TLC's state graph, or turns an agreed chart into a TLA+ skeleton. Bugs are drawn as numbered paths that end in a state that breaks a rule. It ships 27 files, 479 KB, including `statechart.mjs` (36 KB), `lib.mjs` (34 KB), `render.mjs` (19 KB), a TLA+ and TLC integration, and a 260 KB test fixture.

## What was measured

- `mise` installed with Homebrew `7.0.10`, `mise` version `2026.10.19 macos-arm64`.
- `findTlc()` from the upstream `scripts/tlc-tools.mjs` installed `java@temurin-25` and `github:tlaplus/tlaplus@1.7.4` and returned both paths. TLC runs on this machine.
- All 27 blobs were downloaded at the pinned commit and their Git blob SHAs matched.
- `node skills/statechart/scripts/statechart.mjs --help` printed the full command set.
- The upstream suite `scripts/test/statechart.test.mjs` ran with `node --test`: 150 tests, 127 passed, 19 failed, 1 of the 150 is skipped on this platform because it needs a PID namespace.

Because the vendored files were byte-identical to upstream, every failure below is an environment or upstream difference, not a port adaptation.

## The 19 failures

Filesystem failure injection on APFS:

- a file that is put in the output folder during a run stays, and the run exits 2
- a run that cannot rename keeps the folder that another run puts in place of its folder as soon as the run makes it
- a run that cannot rename replaces a folder that another run makes before its copy, and keeps one that another run makes during its copy
- a run that cannot rename stops when another run removes its folder during its copy and makes an empty one in its place, and keeps that folder
- a run whose input changes before `--png` renders stops before it renders, and keeps its files
- a run whose rename fails after it moves the output folder aside puts the folder back, or says where it is
- a run whose spec changes while it reads it leaves the output folder, and the run that read the new spec charts it

TLC graph dump and temp folder handling:

- a graph dump that grows past one string is stopped, and the rule results stay
- a state graph too large for one string prints the rule results, keeps TLC's output, and draws no chart
- an error after TLC runs keeps TLC's output, and the message names its folder
- each TLC run writes the standard modules in its own temp folder, so overlapping runs cannot rewrite them under each other

`--against` discrimination:

- from-spec --against checks the fields of a record that is a record in only some of the spec's states
- from-spec --against compares the code with the spec on the parts both have, and --expect-broken sets the exit code
- from-spec --against names the group when the mapping groups a state of the spec by a field that state lacks
- from-spec --against stops when the mapping reads a field that is a record in some of the spec's states and not in others
- from-spec --against stops when the mapping reads a field that one model has as a number and the other as a string
- from-spec --against stops when the mapping reads what the spec lacks through a spread, a later state, a field of another type, or a field some states lack

mise discovery:

- statechart.mjs finds TLC with the real mise when an untrusted mise.toml is next to the spec and above TMPDIR
- statechart.mjs shows why java cannot start TLC

## What this means for the package

The core flows work. `from-chart` checks an agreed chart and draws it back unchanged. `from-spec` produces a chart from TLC's graph. PNG rendering works. The failures cluster in three places: filesystem atomicity tests written for another OS, TLC output parsing on this TLC build, and `--against` field-type discrimination.

Registering the skill as `ADAPTED` today would claim a suite result this environment does not reproduce. The plan's section 4.2 acceptance for this skill is that the scripts run and the chart, the model and the real tool result agree. Two of the three hold here. The third is partly unverified.

## Options for the package

1. Pin the toolchain. Record `mise` `2026.10.19`, Temurin 25, TLA+ 1.7.4 and macOS in a capability check, then treat the three failure clusters as environment limits with a documented skip list. The skill ships with a preflight that reports blocked when the versions differ.
2. Fix the three clusters upstream or locally before registering. This is a code change of unknown size in a 36 KB script and a 34 KB library, and it needs the upstream authors' intent for the failure-injection tests.
3. Leave the skill unregistered. Users get nothing, but no claim is wrong.

The next step this note recommends is option 1 with a pinned capability check, because options 2 and 3 both cost more than the claim is worth right now. No option is chosen yet.
