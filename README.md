# pi-pstack-native

> **Experimental Preview — `0.6.0-preview.1`**
> Pi-native, independently maintained pstack semantic port. **Not affiliated with or endorsed by Cursor or the upstream pstack maintainers.**

**npm package:** `2333` · **Runtime:** Node.js >=22.19.0, Pi Coding Agent SDK `^1.1.0`
**Status:** Preview (not a verified stable release). **This GitHub-ready checkout does not imply a GitHub repo or npm release has already been published.**

This project adapts [pstack](https://github.com/cursor/plugins/tree/main/pstack) workflows to Pi and implements a native multi-agent orchestration runtime. It uses persistent `AgentSession` state, a durable DAG engine, Git worktree isolation, model routing, and recovery. Version `0.6.0-preview.1` adds strict Task Briefs, artifact fingerprints, deterministic verification gates, audit ledgers, PR shipping constraints, dedicated workflow templates, a coordinator, budgets, context summaries, and an optional standalone runner.

## Read before running

- **Preview limits:** the included acceptance report documents packaged checks; this checkout has not independently proven authenticated LLM inference, live GitHub PR operations, or comparative superiority to Cursor pstack.
- **Remote actions:** merging/opening PRs must be explicitly authorized; do not run the CLI with production GitHub credentials before testing in an isolated repo.
- **Isolation:** worktrees, locks and readonly tools are **not** an OS security sandbox. Do not use with untrusted instructions or repositories without stronger OS isolation.
- **License and attribution:** see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md); maintain upstream copyright notices on redistributed materials. Maintainers should confirm rights to all added source material before public release.

## Capabilities in this preview

- Pi-native persistent workflow DAG, retry/cancel/recovery, explicit integration and worktree isolation.
- Strict task contracts with scope, structured reports, independently executed verification gates and SHA-aware artifact/ledger checks.
- PR frontier checks and authorized shipping; typed Arena/Swarm/Review and autopilot templates.
- Model panels, budget tracking, program coordination, context snapshots and standalone local runner.
- Adapted Skills/Playbooks; see [PARITY.md](PARITY.md) for the **semantic** parity boundary (not file-by-file or Cursor platform parity).

## Project documentation

- [Setup and examples](examples/README.md) · [Implementation / feature boundaries](IMPLEMENTATION.md)
- [Acceptance evidence and limitations](ACCEPTANCE.md) · [Installed package checks](INSTALLATION-CHECK.md)
- [Original PRD](PRD.md) · [Upstream parity](PARITY.md) · [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Publishing a GitHub repo](docs/PUBLISHING.md) · [Validation status](docs/VALIDATION.md)

## Install

```bash
# From the checked-out repository (recommended for this Preview):
npm ci
npm run build
pi install .
```

If `2333` is separately published to npm, the published package may also be installed with `pi install npm:2333`; GitHub source availability does not itself imply an npm release.

Requires Node.js **22.19 or newer** and `@earendil-works/pi-coding-agent` within the declared peer range `^1.1.0`. The lock resolves SDK `1.1.0`. It was generated with Node `24.21.0` and npm `11.12.1`. See [dependency review](docs/DEPENDENCIES.md) for licenses.

## Start

```text
/setup-pstack
/poteto-mode fix this bug and prove the real behavior
```

`/setup-pstack` asks for one model selector per role and one global child reasoning level. The reasoning level can be `inherit-parent`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. An explicit level that the resolved model cannot support fails closed instead of silently downgrading.

Useful status commands:

```text
/pstack-runtime
/pstack-parity
/pstack-workflows
/pstack-agents
/pstack-upstream
```

## Native agent tools

The model receives Pi-native pstack tools:

- `pstack_agents` — run/start/status/send/stop one bounded Pi child session. A background writable `start` defaults to a worktree so it cannot silently collide with the parent checkout.
- `pstack_workflow` — run persistent dependency graphs with bounded concurrency and explicit integration semantics.
- `pstack_graph` — lower-level explicit DAG edges.

For code that must land in the user's checkout, prefer `pstack_workflow` over several independent `pstack_agents` starts. The workflow engine knows when to keep one writer local, isolate parallel writers, and require an integration owner.

## Durable recovery

State lives under:

```text
~/.pi/agent/pstack-native/
├── workflows/
├── agents/
├── journals/
├── sessions/
├── worktrees/
├── loops/
├── locks/
├── config.json
└── models.json
```

A completed workflow node is never automatically repeated on process recovery. A node that was running reopens its existing Pi child session and gets a resume instruction to inspect current repository/session state before continuing. Fresh dead-process locks are detected by PID and cleared immediately; live owners keep their locks.

The implementation deliberately uses Pi Coding Agent's persistent `AgentSession`/`SessionManager` for conversations and a pstack-native atomic JSON + append-only journal for orchestration. It does **not** open a second `@earendil-works/pi-durable` Harness inside the extension, because that would create a second model/auth/conversation owner beside Coding Agent. The storage boundary is isolated so it can move to a future official bridge without changing pstack workflow semantics.

## Writer and integration semantics

A simple change:

```text
worker (target checkout) -> verifier (same checkout)
```

Parallel independent changes:

```text
worker-a (worktree A) --\
                       integrator (target checkout) -> verifier
worker-b (worktree B) --/
```

The engine rejects a writable node that depends on several writable artifacts unless that node uses profile `integrator`. It also rejects a reviewer/verifier that directly depends on several isolated writer artifacts; integrate first, then verify the combined checkout.

## Poteto Mode

`/poteto-mode` is sticky in the current Pi session:

```text
/poteto-mode <task>
/poteto-mode off
```

The native `poteto-mode` skill routes work to one of 23 adapted playbooks and tells the model to use Pi-native agent/workflow tools instead of literal Cursor `Task`, cloud-agent, Custom Mode, or `/loop` mechanics.

## Chat catch-up

Run `/skill:ketchup` to catch up on this chat since your last user-authored message before the request. Notifications and child completion messages do not move that cutoff. The skill rechecks status without writes and lists decisions or steps that need you. Each decision includes enough context to read on its own. Structural tests cover discovery and required text. Chat behavior itself was not exercised. Its harness belongs to issue #6.

## PR handoff

[Opening a PR](skills/poteto-mode/playbooks/opening-a-pr.md) requires Why, What changed, Scope, Blast Radius, and Verification headings. Tradeoffs is optional. Open ready PRs. A stacked child targets its parent branch. Finish the phase or stack before a requested babysit pass, unless an explicitly assigned full-autonomy owner owns the loop. External writes and merges still need explicit authorization. See the [sample stack and local negative checks](docs/PR-PROTOCOL.md). Cursor private PR-tool provenance and watcher verdicts remain unsupported.

## Repeating checks

```text
/pstack-loop 20m inspect CI and continue only if the next gate is clear
/pstack-loop list
/pstack-loop status <id>
/pstack-loop run <id>
/pstack-loop pause <id>
/pstack-loop resume <id>
/pstack-loop stop <id>
```

The scheduler is session-local. It does **not** wake a closed Pi process or a sleeping machine. If a run was missed, the default policy performs at most one catch-up after the same session resumes. Loop state uses an atomic cross-process lock; each loop also has an execution lock held through Pi's asynchronous `sendUserMessage()` call. If another process owns either lock, the due time remains available and the scheduler retries with bounded exponential backoff.

The scheduler advances the durable occurrence before sending it, which gives cooperating schedulers an **at-most-once dispatch attempt per claimed occurrence**, not exactly-once delivery. A host crash after the state claim but before Pi accepts the message can lose that occurrence. Updates, disabling, or removal affect future unclaimed occurrences; they cannot recall a message already submitted to Pi. `stop()` prevents future timer callbacks and does not preempt an in-flight Pi turn.

## Skill discovery toggle

```text
/pstack status
/pstack off
/pstack on
```

Skills are supplied through Pi's `resources_discover` hook. Turning them off and reloading removes this package's skill directory from discovery while leaving runtime/status commands available.

## Compatibility claim

See `PARITY.json` and `PARITY.md`.

- `ADAPTED`: the top-level skill/playbook behavior is represented with Pi-native runtime semantics.
- `CURSOR_ONLY`: known unsupported Cursor-only behavior; never silently claimed as working.
- `PI_ONLY`: native control/runtime capability added by this port.
- `PENDING_PORT`: incomplete item inside the listed semantic coverage.

**Verified baseline:** Cursor pstack `0.15.17` at `978ca6e9c0e012047cd5058b8e829240336e704e`. The official pinned tree contains 52 top-level skills and 23 Poteto playbooks. These are observed name counts, not proof of exercised behavior. [The sync report](docs/upstream-sync-0.15.17.json) checks names and runtime seams. [The wording review](docs/UPSTREAM-0.15.17.md) records intentional differences. `ADAPTED` does not mean behavioral parity was tested. Auxiliary files, Cursor platform parity, and byte-for-byte parity are not claimed. `make-bot-ui` remains explicitly Cursor-only.

## Safety boundaries

- Unknown or dirty worktrees are never force-deleted automatically.
- Reviewer profiles receive no bash/edit/write tools.
- Verifiers have no bash/edit/write tools. Writable worker/integrator agents run tests and preserve evidence; verifiers inspect files and logs using confined read/search tools.
- External effects such as pushes, PR comments, remote API writes, and merges are not made exactly-once by a local journal. Recovery instructions require inspecting remote state before repeating them.
- Runtime-created worktrees are kept until explicit cleanup so crash recovery never destroys uncertain work.

## Validation and review

```bash
npm run check
npm test
node --test docs/parity.test.mjs
npm run review
npm pack
```

The current suite covers graph validation, bounded concurrency, chain dependencies, failed-dependency propagation, process recovery, recovery beyond a concurrency window, terminal wake-up semantics, dead/live locks, writer placement, explicit integration, verifier artifact placement, dirty-worktree refusal, read-only path confinement, loop schedule locking, atomic state/journals, and model/reasoning routing. Static review also checks nested-runtime wiring and the depth cap.

The build sandbox cannot perform a real-provider Pi child-agent smoke test because it has no installed Pi host/model credentials. API contracts are checked against current official Pi source, and `REVIEW.md` records this residual risk instead of claiming it was tested.

## License and provenance

MIT. Upstream pstack semantics/content are attributed to Lauren Tan and retain upstream MIT obligations. New Pi-native runtime code belongs to this project. See `NOTICE.md`.

## v0.3.1 isolation and recovery fixes (retained)

- File locks are held by an owner token and file identity: failed contenders cannot unlink the current holder. Only `ESRCH` is considered evidence that a locked process is dead.
- Shared writers lock the canonical Git checkout root, so subdirectories and symlink aliases cannot bypass the lock. Different worktrees retain distinct lock identities.
- Writable profiles cannot use `readonly`; integrators must use `shared`. The verifier no longer exposes shell access, because shell commands can modify files.
- DAG placement follows transitive write-artifact lineage, rejects forked concurrent writes on one lane, and refuses misleading multi-artifact verification without integration. Explicit unsafe `shared` overrides are rejected.
- Tool actions on agents, workflows and worktrees are limited to the originating parent Pi session. Legacy agent records without ownership information are not visible via these tools.
- Worktrees cannot be cleaned up while their agent or owning workflow may still be active. Cancellation blocks a concurrent successful response from overwriting the cancelled state.

**Operational limitations:** Real Pi/LLM smoke tests remain necessary in an installed Pi host. A completed AI integrator is not, by itself, a formal proof that every patch was merged; workers/integrators should run tests, and verifiers should review their evidence. File locks rely on cooperative processes rather than protection against malicious filesystem tampering.


## Historical: v0.3.4 scheduler reliability changes

- Timer callbacks contain synchronous throws and asynchronous rejections, log them, and retry state-store or per-loop execution-lock contention with bounded exponential backoff.
- `start()` / `stop()` lifecycle generations invalidate old callbacks; one scheduler instance never overlaps its own ticks.
- Per-loop execution locks span the asynchronous Pi send. A second Pi process leaves a due occurrence untouched while that loop is still running, then retries after the lock is released.
- Multi-process scheduling is at-most-once per claimed occurrence. A process crash between advancing `nextRunAt` and dispatch can lose a delivery; an already dispatched message cannot be recalled by disabling or deleting the loop.
- Real timer and separate-process tests cover lock conflicts, bounded retries, stop races, send failures, competing schedulers, in-flight updates, and disable behavior.

## v0.3.2 reliability and security changes

- **Outcome integrity:** a child only completes when the latest assistant message from the current prompt has `stopReason: "stop"`. Provider errors, aborts, incomplete tool turns, truncated outputs and missing messages do not become completed nodes.
- **Cooperative cancellation:** `cancel` persists an intent (`cancelling`) before requesting local/remote stops. `cancelled` means the affected calls have settled; a remote owner that has not acknowledged termination remains in `cancelling`. The owner polls for cancellation and calls Pi `session.abort()`; already-running side effects may still complete before Pi cooperates.
- **Transactional workflow lifecycle:** pause, resume, retry, cancel, and executor node updates share short-lived cross-process state locks and a monotonic `revision`. Long-lived execution locks remain separate; rename alone was never sufficient for read-modify-write correctness.
- **Confined read-only tools:** non-writable profiles receive only custom workspace-confined `read/ls/find/grep` and do not load nested pstack extensions. Their custom `read` limits text size and lines; the Pi native unrestricted `read` is not enabled. This is path confinement, not an OS sandbox.
- **Bounded grep:** regex searches run in a killable Worker with a 1.5-second deadline, input and result limits. Catastrophic backtracking times out instead of blocking the host process.
- **Verification:** new unit/subprocess regression tests cover terminal status, cancellation, path traversal, ReDoS, and actual OS-process contention. The previous `scripts/review.mjs` string-matching checks have been replaced by explicit validation metadata.

Run offline-safe local checks with `npm run check`. With dependencies installed on a supported Node runtime, also run `npm run check:types` and `npm run check:host`. Run authenticated inference tests in a real configured Pi Host before production deployment. The `.github/workflows/ci.yml` workflow runs source checks, type checks, compilation, SDK smoke tests and benchmark fixture smoke checks on supported Node 22 and 24 runtimes. **Do not treat successful mock tests as proof of live provider behavior.**

## Benchmark

```bash
npm run build
npm run benchmark:smoke   # offline import-path and fixture checks; not an LLM benchmark
npm run benchmark -- --agent-dir /absolute/path/to/pi-agent --model provider/model --output /absolute/results
```

`benchmark:smoke` does **not** measure real tasks. Model-driven benchmarks require separately configured credentials, run in dedicated local repositories, and have not been used to justify performance claims.
