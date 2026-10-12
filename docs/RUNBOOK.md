# Release gate runbook

This file is the operating record for the end-to-end release gates of issue [#6](https://github.com/2333sky/pi-pstack-native/issues/6). It names the three test tiers, the exact commands, the evidence, and the cleanup.

## Tiers

| Tier | Test names | Needs | Runs in CI | Default |
|---|---|---|---|---|
| 1 offline | `[offline] ...` | Node, git, a local scratch directory | yes, required | yes |
| 2 fake provider | `[fake-provider] ...` | Node, git, the real Pi SDK, a loopback HTTP model and a loopback GitHub server on `127.0.0.1`, a real child process | yes, required | yes |
| 3 live | `[live] ...` | Node, git, `gh`, an authenticated GitHub account, one operator-named disposable repository | never automatic | off, manual |

Every test name starts with its tier tag, so a report line identifies the tier without reading the file.

## Versions and environment

Recorded on 2026-10-12 in this worktree.

| Component | Version |
|---|---|
| Node | v26.0.0 |
| npm | 11.12.1 |
| git | 2.39.5 (Apple Git-154) |
| gh | 2.87.3 |
| @earendil-works/pi-coding-agent (real SDK under test) | 1.1.0 |
| package under test | 2333@0.6.0-preview.1 |
| OS | macOS 15.6.1 (24G90) |

The repository CI matrix runs Node 22.19.0 and 24.x. Tier 1 and tier 2 were executed here on Node v26.0.0 only, because no other Node runtime is installed in this worktree.

Environment variables used by the tiers:

| Variable | Tier | Meaning |
|---|---|---|
| `PSTACK_NATIVE_HOME` | 1, 2 | Durable protocol, ledger, agent and worktree root. Each test creates its own temporary directory. |
| `PI_CODING_AGENT_DIR` | 2 | Pi agent directory holding the loopback `models.json`. |
| `PSTACK_E2E_LIVE=1` | 3 | Opens the live tier. Absent means the tier is skipped. |
| `PSTACK_E2E_LIVE_REPO=owner/name` | 3 | The one repository the operator names. |
| `PSTACK_E2E_LIVE_CONFIRM=owner/name` | 3 | Must repeat `PSTACK_E2E_LIVE_REPO` exactly. |
| `PSTACK_E2E_LIVE_BASE=main` | 3 | Base branch for the read and write probes. |
| `PSTACK_E2E_LIVE_PR=12` | 3 | Optional existing pull request number for the read probe. |
| `PSTACK_E2E_LIVE_WRITE=1` | 3 | Enables the pull request create and close probe. |
| `PSTACK_E2E_LIVE_CLONE=/path` | 3 | A clone of the named repository, required by the write probe. |

## Tier 1 offline

```bash
node --experimental-strip-types --test test/e2e/offline.test.ts test/e2e/reported-defects.test.ts
```

Covers: the live tier stays closed without an explicit operator target, and stays closed for a residual `PSTACK_E2E_LIVE_WRITE` or `PSTACK_E2E_LIVE_CLONE` left in the environment; every refused environment runs the live file to completion with both tests skipped and no external command; every test file in the live tier consults only the guard gate; the live file is skipped when it runs on its own; `GitHubCLI` validates repository and pull request input before it touches `gh`; the GitHub provider refuses a merge whose expected head has moved; a fixture repository carries no credential in captured output.

Evidence, 2026-10-12:

```text
ℹ tests 20
ℹ pass 18
ℹ fail 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 2602.630208
```

The two `todo` entries are reproductions of reported source defects. They run on every invocation and print their failure, and they do not fail the run. See "Reported defects" below.

## Tier 2 fake provider

```bash
node --experimental-strip-types --test test/e2e/shipping.test.ts test/e2e/workflow.test.ts
```

`shipping.test.ts` drives the real `src/delivery` code, a real git fixture repository whose origin looks like `https://github.com/loopback-owner/lemn-disposable.git`, a real ledger from `src/verification`, a loopback GitHub HTTP server, and a real child process that is killed with `SIGKILL` inside `merge`.

| Test | What it proves |
|---|---|
| a verified commit opens a pull request and its base, head, CI and review state are read back | `preparePR` binds the plan to the verified commit; `openPreparedPR` refuses an unverified remote head; the opened pull request reports base ref, base SHA, head SHA, check state and review state; the frontier is eligible. |
| a stale head SHA blocks the merge | after the remote head moves, the approved digest no longer matches, the merge call is never reached, a re-authorized attempt is blocked by `CURRENT_VERIFICATION_REQUIRED`, and the provider itself rejects a stale expected head with `HEAD_MOVED`. |
| a crash before the external side effect replays exactly once and never double-merges | the intent is durable before the merge, the remote is untouched, the first recovery call reads the remote before anything else, and exactly one merge reaches the provider. |
| a crash after the external side effect is at most once because recovery reads the remote first | the remote is merged and unconfirmed; the consumed authorization path reads the remote before it fails; neither the same authorization nor a re-authorized replay reaches a second merge; a dry run reports `ALREADY_MERGED`. |

`workflow.test.ts` drives the real `WorkflowEngine`, real `AgentHost` children on real Pi `AgentSession` objects, a real loopback model that drives real `bash` and `write` tool calls, two real git worktrees, a real integrator, and real gate commands through `src/verification`.

| Test | What it proves |
|---|---|
| a strict workflow runs two worktrees, an integrator and deterministic verification | four strict nodes complete; the two writers own distinct existing worktrees with the written artifacts; the integrator runs in the target checkout and receives both workspace paths; the integrated checkout holds both artifacts; the verifier holds no mutating tool; every node records a passing ledger. |
| a workflow resumes after SIGKILL without replaying completed calls or external effects | a real `SIGKILL` interrupts the second writer; the completed writer is not re-requested; the interrupted child resumes its own session file and worktree; attempts stay at 1; the resumed prompt carries the resume instruction; the workflow still reaches `completed` and verification still runs. |

Evidence, 2026-10-12:

```text
✔ [fake-provider] a verified commit opens a pull request and its base, head, CI and review state are read back (1183.927917ms)
✔ [fake-provider] a stale head SHA blocks the merge (721.886834ms)
✔ [fake-provider] a crash before the external side effect replays exactly once and never double-merges (1106.139541ms)
✔ [fake-provider] a crash after the external side effect is at most once because recovery reads the remote first (945.986375ms)
✔ [fake-provider] a strict workflow runs two worktrees, an integrator and deterministic verification (4692.189375ms)
✔ [fake-provider] a workflow resumes after SIGKILL without replaying completed calls or external effects (5455.667625ms)

ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 9218.304916
```

## Tier 3 live, not executed

```bash
node --experimental-strip-types scripts/e2e-live.mjs --repo <owner>/<name> --confirm <owner>/<name> [--base main] [--pr 12]
node --experimental-strip-types scripts/e2e-live.mjs --repo <owner>/<name> --confirm <owner>/<name> --clone /path/to/clone --write
```

Default state, 2026-10-12:

```text
﹣ [live] reads the operator-named repository and its pull request state through gh # live tier closed: PSTACK_E2E_LIVE is not set to 1
﹣ [live] verifies a live pull request from an operator clone and closes it again # live tier closed: PSTACK_E2E_LIVE is not set to 1
ℹ tests 2
ℹ pass 0
ℹ fail 0
ℹ skipped 2
```

**This tier was not executed.** No credentialed GitHub write and no external model call was made for this record. The operator script refuses to start unless `--repo` and `--confirm` carry the same repository name, `--write` has an explicit `--clone`, and `gh auth status` succeeds. The guard in `test/live/guard.ts` additionally refuses the repository of the current checkout and the protected `2333sky/pi-pstack-native`, and it is the only gate either live test consults.

What it would need to run:

- one disposable GitHub repository, write access for the authenticated account, and its exact `owner/name`;
- an authenticated `gh` on the runner (`none` is available to the CI workflow today);
- for the write probe, a local clone of that repository with `origin` pointing at it, a clean working tree, and permission to push a temporary branch.

What the live tier would prove that tiers 1 and 2 cannot: `gh` argument handling against the real API, real check-rollup and review-decision parsing, and real branch protection behaviour.

### The guard decision

`test/live/guard.ts` exports one gate, `liveTier(requirement, env?, checkout?)`. A test consults the gate and nothing else.

- A closed decision carries the reason and the `skip` string for `node:test`. It carries no repository, no clone, and no capability.
- An open decision for `read` carries the repository, the base, and the optional pull request number.
- An open decision for `write` carries the clone as a required string.

Both live tests take their `skip` from the gate and re-check `gate.open` inside the body. The offline tier reads every `test/live/*.test.ts` file and fails if one reads a `PSTACK_E2E_LIVE_*` variable directly, consults the raw target instead of the gate, or declares a test whose skip does not come from a gate.

The offline tier walks eleven refused environment combinations, including `PSTACK_E2E_LIVE_WRITE=1` plus `PSTACK_E2E_LIVE_CLONE` with `PSTACK_E2E_LIVE` unset. It runs `test/live/github-live.test.ts` in each combination under `test/live/command-probe-register.mjs`, a module hook that records every `child_process` call to `PSTACK_E2E_COMMAND_PROBE`. Each row must report `skipped 2` and `fail 0`, and the recorded command list must be empty. The row that names the repository of the current checkout records one read-only `git remote get-url origin`, and no `gh` call and no mutating git call.

Before this change the write test consulted `target.write && target.clone`, so a residual `PSTACK_E2E_LIVE_WRITE=1` plus `PSTACK_E2E_LIVE_CLONE` entered the write path while `PSTACK_E2E_LIVE` was unset. The guard probe also ran on every combination. The row below is from that run.

```text
✖ a residual write and clone with the full operator name minus PSTACK_E2E_LIVE (252.20125ms)
  AssertionError [ERR_ASSERTION]: a residual write and clone with the full operator name minus PSTACK_E2E_LIVE
  fatal: cannot change to '/Users/cyq/codex/worktrees/pi-pstack-native/pi-worktree-5dbdb80f-618c-43be-96d8-9d4d1cd1d28f-s0-0/.e2e-live-matrix-WNWALV/absent-clone': No such file or directory
  ﹣ [live] reads the operator-named repository and its pull request state through gh (0.732209ms) # live tier closed: PSTACK_E2E_LIVE is not set to 1
  ✖ [live] verifies a live pull request from an operator clone and closes it again (42.932584ms)
  ℹ tests 2
  ℹ pass 0
  ℹ fail 1
  ℹ skipped 1
  ✖ failing tests:
  test at test/live/github-live.test.ts:36:1
  ✖ [live] verifies a live pull request from an operator clone and closes it again (42.932584ms)
    Error: Command failed: git -C /Users/cyq/codex/worktrees/pi-pstack-native/pi-worktree-5dbdb80f-618c-43be-96d8-9d4d1cd1d28f-s0-0/.e2e-live-matrix-WNWALV/absent-clone checkout -q main
    fatal: cannot change to '/Users/cyq/codex/worktrees/pi-pstack-native/pi-worktree-5dbdb80f-618c-43be-96d8-9d4d1cd1d28f-s0-0/.e2e-live-matrix-WNWALV/absent-clone': No such file or directory
```

After the change the same file reports every refused row as a pass, with no write path and no command:

```text
✔ [offline] every refused live-tier environment runs no external command and enters no write path (2259.683166ms)
  ✔ no live environment at all (196.133958ms)
  ✔ a residual PSTACK_E2E_LIVE_WRITE and PSTACK_E2E_LIVE_CLONE with nothing else (192.504958ms)
  ✔ a residual write and clone plus a repository name (191.983583ms)
  ✔ a residual write and clone with the full operator name minus PSTACK_E2E_LIVE (195.12925ms)
  ✔ a residual PSTACK_E2E_LIVE_CLONE alone (197.404666ms)
  ✔ PSTACK_E2E_LIVE=1 with no repository (196.087708ms)
  ✔ PSTACK_E2E_LIVE=1 with a repository and no confirmation (195.928834ms)
  ✔ PSTACK_E2E_LIVE=1 with a mismatched confirmation (192.20025ms)
  ✔ PSTACK_E2E_LIVE=1 naming the protected repository (187.061125ms)
  ✔ PSTACK_E2E_LIVE=1 with write and no clone (199.363833ms)
  ✔ PSTACK_E2E_LIVE=1 with a residual write, a clone and the repository of the current checkout (312.204292ms)
✔ [offline] every test in the live tier consults only the guard gate (0.35575ms)
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

## Reported defects

Two source defects were found while building this coverage. Both files belong to other lanes, so this change ships a pinned reproduction for each instead of a fix. A `todo` test runs on every invocation and prints its failure without failing the run, so the defect stays visible in every CI log.

1. `src/agent/host.ts` read-only profiles. `execute` passes `tools: profile.tools` for a writable child and `tools: []` for a read-only child. An empty allowlist also clears `customTools`, so the four sandboxed read-only tools from `src/agent/read-only-tools.ts` are never registered and a reviewer, verifier or scout child receives **zero** tools. The profile prompts still instruct those children to inspect files. Reproduction: `[offline] reported src defect: read-only child profiles receive no read-only tools`. The reproduction drives the real `AgentHost`: it starts a `reviewer` child on a fixture checkout against the loopback model server, then reads the tool list the child session actually offers. The defect is open until `src/agent/host.ts` is fixed in its own lane.

   ```text
   ⚠ [offline] reported src defect: read-only child profiles receive no read-only tools (261.108ms)
     AssertionError [ERR_ASSERTION]: a read-only child must be able to inspect its own checkout
     + actual - expected

     + []
     - [
     -   'find',
     -   'grep',
     -   'ls',
     -   'read'
     - ]
   ```

2. `src/verification/runner.ts` redaction. `redact` requires a colon inside URL userinfo (`https?://[^\s/@]+:[^\s/@]+@`), so `https://<token>@github.com/owner/repo.git` survives into the on-disk evidence log. A bare credential with no `token=`, `api_key=`, `password=` or `secret=` label also survives. Reproduction: `[offline] reported src defect: a captured evidence log leaks a credential embedded in a URL`.

   ```text
   ✖ AssertionError [ERR_ASSERTION]: the evidence log still contains the credential:
   https://ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@github.com/owner/name.git
   bare ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
   GITHUB_TOKEN=[REDACTED]
   Authorization: Bearer [REDACTED]
   ```

Verbatim failing run of both reproductions before they were pinned, 2026-10-12:

```text
✖ [offline] reported src defect: read-only child profiles receive no read-only tools (38.743792ms)
✖ [offline] reported src defect: a captured evidence log leaks a credential embedded in a URL (550.272167ms)
ℹ tests 2
ℹ pass 0
ℹ fail 2
ℹ skipped 0
ℹ todo 0
```

## Required CI wiring

No test tier runs by default in `npm test`, which globs `test/*.test.ts`. The root adds these scripts and one CI step; this change does not touch `package.json` or `.github/workflows/ci.yml`.

```json
"test:e2e:offline": "node --experimental-strip-types --test test/e2e/offline.test.ts test/e2e/reported-defects.test.ts",
"test:e2e:fake": "node --experimental-strip-types --test test/e2e/shipping.test.ts test/e2e/workflow.test.ts",
"check:e2e": "npm run test:e2e:offline && npm run test:e2e:fake",
"test:live": "node --experimental-strip-types scripts/e2e-live.mjs",
"check:release": "npm run check && npm run check:types && npm run check:e2e && npm run build && npm run check:host && npm run benchmark:smoke && npm run smoke:installed"
```

Required check: `npm run check:e2e` (tiers 1 and 2). It needs Node, git and the loopback servers only, and it runs in about 20 seconds.

CI step, inside the existing `check` job after "Package source checks and tests":

```yaml
      - name: e2e release gates (offline and fake provider)
        run: npm run check:e2e
```

Manual and never a required check: `npm run test:live`. It is operator-only, because it needs a credentialed GitHub account and a repository name that only the operator can supply. Recommended wiring is a separate `workflow_dispatch` workflow with `contents: read`, the `test:live` step, and a repository input that the operator types into the dispatch form, mirrored into `PSTACK_E2E_LIVE_REPO` and `PSTACK_E2E_LIVE_CONFIRM`. Adding it to a pull request job would target whatever repository the runner resolves, which the guard is designed to prevent.

## Cleanup

Each tier cleans up after itself, and the steps below reclaim anything a crash left behind.

- Tiers 1 and 2 create one scratch directory per test under the working directory (`.e2e-*`) plus a temporary `PSTACK_NATIVE_HOME` inside it, and remove both in a `finally` block. A hard crash of the test runner leaves both behind: `rm -rf .e2e-*`.
- Tier 2 creates git worktrees under `<PSTACK_NATIVE_HOME>/worktrees` and branches named `pstack-native/<agent id>` in the fixture repository. Both live inside the scratch directory and are removed with it.
- The tier 2 crash tests leave stale lock files by design. `src/runtime/lock.ts` reclaims a lock whose owner process is dead, so the next run needs no manual step.
- Tier 3 write probe: close the pull request and delete its branch. `scripts/e2e-live.mjs` prints the pull request close, branch delete, probe commit and home directory steps on exit. The probe commits one file, `PSTACK-E2E-LIVE.md`, in the operator clone and removes it in a `finally` block.
- Nothing in any tier writes to the checkout of this repository, to the shared `~/.pi` agent directory, or to a remote, except the tier 3 write probe against the repository the operator named.

## What this record does not claim

- No credentialed model inference and no GitHub repository creation happened for this record.
- The tier 3 live path was not executed. Its assertions describe intended behaviour, not observed behaviour.
- Tiers 1 and 2 were executed on Node v26.0.0 only. The CI matrix on Node 22.19.0 and 24.x is not yet confirmed for these files.
- A green gate is not a production readiness claim. Two source defects found by this coverage are still open.
