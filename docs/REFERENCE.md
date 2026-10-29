# Runtime and maintainer reference

[Documentation index](README.md) · [Project overview](../README.md) · [中文说明](../README.zh-CN.md)

## Native agent tools

The model receives Pi-native pstack tools:

- `pstack_agents` — run/start/status/send/stop one bounded Pi child session. A background writable `start` defaults to a worktree so it cannot silently collide with the parent checkout.
- `pstack_workflow` — run persistent dependency graphs with bounded concurrency and explicit integration semantics.
- `pstack_graph` — lower-level explicit DAG edges.

For code that must land in the user's checkout, prefer `pstack_workflow` over several independent `pstack_agents` starts. The workflow engine knows when to keep one writer local, isolate parallel writers, and require an integration owner.

## Model setup and routing

Run `/setup-pstack` in Pi's interactive UI. Choose a reasoning budget, then page through the role models, task overrides and suggested panels. Save the choices or edit individual roles, task roles or panel seats, including their order. The budget and fallback policy can be changed from the review screen. A new setup starts with `large` selected; a rerun selects the existing level. Existing values and unrelated configuration are preserved; cancelling before saving does not write a partial configuration. Fresh suggestions use models available to the session, prefer different recognized families for runner seats where possible, and report repeated seats. Registry visibility does not prove a successful inference.

Unavailable explicit models and incompatible reasoning levels are marked in the preview and must be fixed before saving; the wizard stays open so a model, budget or fallback can be changed. `auto` and `inherit-parent` remain valid model aliases. If the configuration file is malformed, or changes while setup is open, setup stops without overwriting it.

After a successful save, when a parent model is selected, setup starts a model turn to inspect the project for a real-app harness or `verify-*` Skill and for a project-local formal-verification Skill. If either is missing, the agent is instructed to offer its corresponding creation Skill and wait for the user's answer. This inspection and the subsequent conversation depend on the model and have not been proved by the configuration save itself; no verification Skill is created automatically. Without a parent model, setup reports the manual Skill commands instead.

The `unlimited`, `large`, `medium`, and `small` budget choices map to Pi `max`, `xhigh`, `high`, and `medium` thinking levels. The optional `same-family` fallback selects a recognized family from the same provider or lowers an unsupported reasoning level, with a note; it does not switch providers, rewrite Cursor `-fast` slugs or retry authentication/inference errors. Legacy configurations without a policy retain `disabled`.

Pass `playbook` to `pstack_agents` or `pstack_workflow` for task overrides; for named roles such as `reflect` tooling, judgment, divergent and synthesizer, pass `modelRole` as well. An explicit model wins over a named role, then a profile override, then the generic role default. The coordinator must actually supply the routing fields.

Arena, architect and interrogate load configured panels; unconfigured panels use disclosed session-available suggestions. Unavailable seats are reported and replaced or dropped when possible. With a known parent family, arena/architect choose a judge only from a different recognized family; without one, their plan returns candidates for the coordinator to compare, integrate and verify. With a judge, verified worktrees are available through confined `pstack_candidates`, and failed candidates are recorded and excluded before comparing surviving verified work. Architect adds an implementation phase after the chosen sketch; the coordinator still owns grounding and any requested checkpoint.

Interrogate copies the fixed target's staged, unstaged and untracked files into isolated adversary worktrees. A separate repro session reruns each adversary's findings in its worktree; no changes are integrated. Reports require commands and observed/expected output, but are model statements, so inspect actual command evidence and repro edits before accepting a finding. Swarm offers partition, best-of, first-pass and rank-all; mixed partition/race requires an explicit DAG. First-pass cancellation is cooperative and the workflow waits for remaining calls to settle.

Use `pstack_semantics` with `action: "panel"` and `pstack_workflow` with `action: "plan"` to inspect seats, fallbacks and judge-skip notes. Templates require a strict brief; arena/architect require a rubric. Registry resolution does not prove authentication or successful inference.

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

**Active source pin:** Cursor pstack **0.15.36** at `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`. Its 58 Skill names and 23 playbooks are registered: 57 Skills and all playbooks retain the latest source body through generated Pi entrypoints; `make-bot-ui` stays Cursor-only. Statechart now ships its complete upstream scripts and references; see [toolchain requirements](../docs/STATECHART.md). [Source provenance](../docs/upstream-provenance-0.15.36.json) verifies all 573 upstream blobs. These counts and byte checks do not prove model behavior. Maintainer semantic approval and authenticated real-model evidence remain separate, pending records in `SEMANTICS.json`. The previous source snapshot and historical reports are retained.

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

A user reported Windows real-model runs, including a rerun at commit `4d75ea0b`. See the [Windows test record](WINDOWS-MODEL-TEST.zh-CN.md). The real Pi SDK is also exercised by lifecycle, fake-provider E2E and installed-package smoke tests. Authenticated real-model inference is a separate tier: the managed environment's recorded model check found no configured authorized models. A Pi provider credential is required before that tier can run here. See [the current acceptance status and cloud-environment procedure](../docs/SEMANTIC-COMPATIBILITY.md#implementation-and-acceptance-status).

## License and provenance

MIT. Upstream pstack semantics/content are attributed to Lauren Tan and retain upstream MIT obligations. New Pi-native runtime code belongs to this project. See `NOTICE.md`.

## Benchmark

Each case records the deterministic test gate as `testEvidence` and the task-report decision as `contractAccepted`, separately from `verified` (current workflow acceptance). A passing test gate is evidence for the checked artifact, not a general model-quality score; the benchmark exits successfully only when every selected workflow is verified.

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

## Candidate pstack 0.15.23 behavior ports

This historical candidate has been superseded by the active **0.15.36** source pin. Its behavior changes were implemented or explicitly mapped in
[the per-file candidate receipt](../docs/upstream-sync/candidate-0.15.23.json),
with every upstream diff accounted for. The archived receipt retains its original **proposed / pending maintainer semantic review** status; it does not describe current source availability or prove Cursor equivalence.
See [port details and limitations](../docs/upstream-sync/PORT-0.15.23.md).

## Read-only children and external evidence

Reviewer/scout/verifier/synthesizer children receive only confined
`read/ls/find/grep`, `pstack_skill` and `pstack_evidence`. Their active SDK tool
allowlist excludes bash/edit/write and unrestricted builtin reads. The resource
tool reads only bundled Skill/reference Markdown by ID, such as
`poteto-mode/SKILL.md` or `why/references/epistemics.md`; it rejects traversal,
symlinks, scripts and arbitrary files. Paginate until `hasMore=false` for a
full Skill. Normal workspace reads still reject files outside the worktree.

For external investigation, the **parent** performs authorized live queries
and supplies `evidencePackets` on an agent or workflow node. Each packet has
one category (`source-control`, `issues`, `documents`, `team-chat`,
`observability`, `errors`, `analytics`), a status (`available`, `empty`,
`unavailable`, `inconclusive`), a reason and bounded items with `source`,
`observedAt`, and `excerpt`. The child receives a fixed snapshot, marked
parent-supplied and not independently verified. Missing access is unavailable,
not an empty search or permission to find credentials. The parent must verify
decisive citations against authorized sources and sanitize sensitive data.
No live MCP/credential forwarding is enabled by this change.

## Actual linear PR stacks

The `autopilot-stack` DAG is a **local preparation** template. Its
`deliveryContract=remote-stack-required` prevents treating its completion as
PR-stack delivery. Prepare separate clean worktree branches in a linear chain,
verify each exact head against its exact parent, and push those branches only
when authorized. The root owns topology; each worker owns its branch.

A stack input contains `repo`, `rootBase`, `owner`, and ordered `lanes`:

```json
{
  "repo": "owner/repository",
  "rootBase": "main",
  "owner": "operator",
  "lanes": [
    {"key":"first","cwd":"/absolute/worktree-one","head":"feature/one","ledgerId":"ver_first","title":"First unit"},
    {"key":"second","cwd":"/absolute/worktree-two","head":"feature/two","ledgerId":"ver_second","title":"Second unit"}
  ]
}
```

```bash
npm run build
pstack-runner stack-plan /absolute/stack-input.json /absolute/stack-plan.json
pstack-runner stack-open /absolute/stack-plan.json             # dry-run
pstack-runner stack-open /absolute/stack-plan.json --approve   # explicit remote PR creation
```

Only the first PR targets `rootBase`; each child targets the preceding branch.
`rootBase` is operator input: the first frontier refuses to take its trunk from
the PRs under review, and no later refresh can retarget it. Preparation verifies
shared repository identity, distinct clean worktrees,
branch ancestry, remote heads, current accepted behavior ledgers and exact
parent diff bases. Plans contain stable patch IDs and reject source/ref drift.
Opening rechecks each pair and reuses only an existing open, ready PR matching
that pair. It reads every newly created PR back and compares head and base; a ref
that moves during creation revokes that lane's ledger and stops the remaining
lanes. It does not rebase, force-push, retarget, push branches, merge or
arm auto-merge. Publish branches separately with the user's authority.

Existing custom PRProvider adapters must supply a checked reviewThreads summary, an explicit draft flag and a merge state; absent or unrecognized values block, because missing evidence is not evidence of a safe state. Only `draft: false` with the `CLEAN` merge state passes. Native Frontier snapshots paginate review threads, refuse invalid/repeated
cursors and moved heads, and block unavailable/unresolved review evidence,
drafts and blocked merge states even if CI passes. Native states are
`waiting/reviewable/advance/complete/closed`; they do not pretend to be Cursor
watcher verdicts. Auto-merge requested is not proof of queue readiness.
After a lower PR merges, the root must explicitly prepare/retarget the new frontier to the pinned trunk branch; the native gate refuses landing it into the old parent branch. Head/base changes always invalidate native ledgers; a matching patch ID does
not bypass re-verification. GitHub branch protection must enforce final
server-side merge requirements.

## Explicit-base audit and strict plans

`pstack-runner worktree-audit /absolute/worktree-info.json origin/parent`
reads the explicit PR base and reports dirty/ahead/merged state without deleting
anything. The info object uses the existing `WorktreeInfo` fields `path`,
`branch`, `repoRoot`, `baseRef`. Cursor transcript/sidebar/simulator inspection
remains unsupported; runtime-owned cleanup and active/dirty guards remain.

`npm run check:plan -- /absolute/plan.md` checks the strict upstream program
checklist format with corrected Markdown fence handling and native loop markers.
The format's ten live-proof lanes are opt-in, not authority to launch agents,
spend model budget or run credentialed E2E. No Bun lifecycle is imported.

When local mappings change for the same upstream SHA pair, scans now preserve
the original report and write a fingerprint-suffixed revision. Git blob bytes
are checked against their SHA. Different upstream evidence under the same ID
still fails explicitly; historical evidence is never silently overwritten.

## Core upstream semantics

All supported entrypoints preserve the fixed 0.15.36 source body; the eleven core workflows have critical-rule mappings, with [Pi-specific mappings and deviations](../docs/PI-SEMANTIC-ADAPTER.md) kept separately. `pstack_skill` exposes original Markdown to read-only children; `pstack_semantics` checks capabilities, declared task routing, model panels and round receipts. These checks complement native DAG/ledger/Frontier gates. See [semantic compatibility and evidence tiers](../docs/SEMANTIC-COMPATIBILITY.md). Neither ADAPTED inventory entries nor offline tests establish complete behavioral parity.

[PR #17](https://github.com/2333sky/pi-pstack-native/pull/17) merged the initial 0.15.17 compatibility infrastructure. The [0.15.36 upgrade](../docs/upstream-upgrade-0.15.36.md) describes the current source pin; Pi remains locked to SDK 1.4.0. The foundation PR’s Node 22.19 / 24 CI passed. A subsequent user-reported Windows real-model run is described in the [test record](WINDOWS-MODEL-TEST.zh-CN.md); the repository’s commit-bound authenticated-model receipt remains `not-run` and semantic review remains `pending-maintainer-signoff`. [The remaining acceptance steps](../docs/SEMANTIC-COMPATIBILITY.md#completing-issue-16) explain how to record both without treating a merge or an unavailable-model probe as a passing model test.
