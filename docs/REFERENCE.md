# Runtime and maintainer reference

[Documentation index](README.md) · [Project overview](../README.md) · [中文说明](../README.zh-CN.md)

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

[Opening a PR](../skills/poteto-mode/playbooks/opening-a-pr.md) requires Why, What changed, Scope, Blast Radius, and Verification headings. Tradeoffs is optional. Open ready PRs. A stacked child targets its parent branch. Finish the phase or stack before a requested babysit pass, unless an explicitly assigned full-autonomy owner owns the loop. External writes and merges still need explicit authorization. See the [sample stack and local negative checks](../docs/PR-PROTOCOL.md). Cursor private PR-tool provenance and watcher verdicts remain unsupported.

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

**Active source pin:** Cursor pstack **0.15.32** at `99b609a72323b70204eab407c622f436e858e112`. Its 58 Skill names and 23 playbooks are registered: 57 Skills and all playbooks retain the latest source body through generated Pi entrypoints; `make-bot-ui` stays Cursor-only. Statechart now ships its complete upstream scripts and references; see [toolchain requirements](../docs/STATECHART.md). [Source provenance](../docs/upstream-provenance-0.15.32.json) verifies all 200 upstream blobs. These counts and byte checks do not prove model behavior. Maintainer semantic approval and authenticated real-model evidence remain separate, pending records in `SEMANTICS.json`. The previous 0.15.17 source and historical reports are retained.

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

The real Pi SDK is installed and exercised by the lifecycle, fake-provider E2E and installed-package smoke tests. Authenticated real-model inference is a separate tier: the managed environment's recorded model check found no configured authorized models. A Pi provider credential is required before that tier can run here. See [the current acceptance status and cloud-environment procedure](../docs/SEMANTIC-COMPATIBILITY.md#implementation-and-acceptance-status).

## License and provenance

MIT. Upstream pstack semantics/content are attributed to Lauren Tan and retain upstream MIT obligations. New Pi-native runtime code belongs to this project. See `NOTICE.md`.

## Benchmark

```bash
npm run build
npm run benchmark:smoke   # offline import-path and fixture checks; not an LLM benchmark
npm run benchmark -- --agent-dir /absolute/path/to/pi-agent --model provider/model --output /absolute/results
```

`benchmark:smoke` does **not** measure real tasks. Model-driven benchmarks require separately configured credentials, run in dedicated local repositories, and have not been used to justify performance claims.

The live benchmark defaults to 20 cases, up to 200,000 tokens and 600 seconds per case. This can incur substantial model charges. Use `--limit 1` for an initial run and `--max-tokens N` to set a lower per-case token budget; unknown options are rejected.

## Continuous upstream sync (M1–M4)

Detection ≠ porting ≠ semantic review ≠ integration. The reviewed baseline in
`UPSTREAM.json`/`PARITY.json` stays unchanged when a scan, proposal or test passes.
Tools use Node standard libraries and Git; no AI API key is needed.

```bash
npm run upstream:scan -- --candidate-ref main
npm run upstream:scan -- --from /path/to/cursor/plugins/pstack --candidate-ref <full-sha>
npm run sync:upstream -- --from /path/to/cursor/plugins/pstack
npm run upstream:plan -- --report docs/upstream-sync/reports/<sync_id>.json
npm run upstream:verify -- --report docs/upstream-sync/reports/<sync_id>.json
```

`--baseline-ref <sha>` overrides the scan baseline only. Network mode accepts
`main` or a full SHA and fetches the approved `cursor/plugins` source into an
isolated temporary bare repository. Offline `--from` requires a Git checkout
with both commits available (loose archives cannot establish history evidence).
Only committed `pstack/` content is inspected. Upstream hooks, scripts, prompts,
lifecycle scripts and Actions files are never executed by the detector.
Legacy `--write-report <relative-path>` remains available within this checkout.

Reports and task packages are in `docs/upstream-sync/{reports,tasks}/` with
stable SHA-derived IDs, Git blob/mode evidence, name drift, advisory mappings,
old/new Cursor seam locations, risk and pending acceptance work. Keyword hits
are not runtime-dependency proof. Auxiliary files, binary/non-UTF8 content,
symlinks and oversized files remain visible for human review; files over
512 KiB are not interpreted. Whole Git operations are capped at 32 MiB and
120 seconds; trees/seams over 10,000 entries fail explicitly. Reports do not
embed raw upstream prose, shell output, environment or credential-bearing URLs.

Exit codes: 0 = `no_change` or `changes_detected` (inspect JSON status),
3 = `blocked`, 2 = `error`. A branch-history divergence blocks proposals.
Failures preserve the baseline and can be retried. Same SHA pair produces the
same fingerprint; an intentional local mapping change produces a fingerprint-suffixed report
revision while inconsistent upstream evidence is rejected. Historical reports
are retained. Content-addressed reports and historical
`docs/upstream-sync-0.15.17.json` are retained.

The daily workflow scans with read-only permissions, needs no npm install and
uploads reports when content changes. Issue writes occur in a separate trusted
job and are **opt-in**: set repository variable `UPSTREAM_SYNC_NOTIFY=true` for
scheduled notifications or select `notify` on manual dispatch. Issues are keyed
by `sync_id`, including closed Issues. No-change scans create no remote resource.
Network/API failures fail the job; the next run retries from the unchanged
baseline. Notifications choose tracking Issues rather than report PRs.

### Optional isolated candidate workflow

Commit the detector reports first, then prepare an isolated worktree:

```bash
npm run upstream:prepare -- --report docs/upstream-sync/reports/<sync_id>.json --worktree /absolute/new/worktree
cd /absolute/new/worktree
# Give docs/upstream-sync/tasks/<sync_id>.md to your explicitly authorized developer Agent.
# Port semantics, add tests and per-task rationale/evidence/unresolved differences; commit changes.
npm ci --no-audit --no-fund
npm run upstream:verify -- --report docs/upstream-sync/reports/<sync_id>.json
# Commit ONLY generated verification evidence after a clean committed candidate was verified.
npm run upstream:propose -- --report docs/upstream-sync/reports/<sync_id>.json
# Optional remote write, requires separately configured Git/gh credentials and explicit flag:
npm run upstream:propose -- --report docs/upstream-sync/reports/<sync_id>.json --repo 2333sky/pi-pstack-native --allow-remote-write
```

M4 exports a constrained Agent prompt; it does not select a provider/model or
launch autonomous inference. Agent execution needs the existing Pi isolation
and authorization policy (a worktree alone is not an OS sandbox). Preparation
refuses a dirty checkout or existing destination. Proposal requires the prepared
worktree branch, committed candidate, all seven gates, unchanged source since
verification, and unchanged baseline metadata. Remote proposals are deduplicated
**draft** sync PRs; this specific maintenance flow intentionally differs from the
normal ready-PR playbook. No automatic merge, npm publish or baseline advancement.
A failed/partial candidate remains local/blocked; review its verification JSON.

`upstream:verify` runs check, types, build, host, offline/fake E2E, benchmark smoke
and installed-package smoke and records passed/failed individually. Live
credentialed LLM/GitHub E2E and semantic review remain `not_run`; these are not
inferred from smoke results. Tests execute local candidate code and therefore
must run in a trusted or externally sandboxed environment.

Maintainers grant semantic approval in a separately reviewed metadata change only
after every relevant task is resolved (including explicit unsupported behavior), required
CI is green and semantic approval is obtained. Point `coverage.countEvidence`
to the validated pinned report, update both manifests' SHA/version together,
match names/counts/files, retain `make-bot-ui` and all unsupported declarations,
and retain the PENDING_PORT blocking gate. Only after that PR is approved and
merged may the candidate be described as integrated. No CLI provides an
`integrated` shortcut. See [implementation evidence](../docs/upstream-sync/IMPLEMENTATION.md).
