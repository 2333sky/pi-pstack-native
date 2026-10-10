# pi-pstack-native PRD

> Package name: `2333`
> Project name: `pi-pstack-native`
> Target release: `0.3.0`
> Document type: Product Requirements Document / Engineering Specification
> Status: Draft for implementation
> Baseline date: 2026-10-10

---

## 1. Executive summary

`pi-pstack-native` is a Pi-native implementation of the pstack workflow model.

The project does **not** attempt to emulate Cursor internals or mechanically translate every Cursor API call. Instead, it preserves the **behavioral semantics** of pstack while rebuilding the execution runtime directly on top of official Pi packages.

The target architecture removes all non-official runtime dependencies.

The only allowed runtime dependencies are packages from the official Pi namespace, primarily:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-durable`
- `@earendil-works/pi-ai` when direct model/runtime access is required
- `@earendil-works/pi-tui` when custom TUI surfaces are required

The following existing dependencies are removed from the runtime:

- `@whamp/pi-pstack`
- `pi-subagents`
- `pi-durable-subagents`
- `pi-agents`
- any third-party workflow, orchestration, graph, scheduler, or worktree runtime

The project still treats the official Cursor pstack implementation as an **upstream product specification and content source**, subject to its license and attribution requirements.

The goal is:

> Reproduce the useful semantics of pstack using native Pi primitives, with stronger durability, explicit runtime state, reproducible upstream synchronization, and no third-party runtime dependency chain.

---

# 2. Product vision

## 2.1 Problem

pstack is designed around Cursor-specific features such as:

- Cursor Task/subagent execution
- model rule files
- Custom Modes
- Cursor session/transcript conventions
- cloud agents
- `/loop`
- Cursor-specific automation facilities
- Cursor-specific slash command behavior

Directly copying pstack into Pi therefore creates several problems:

1. Some instructions point at APIs Pi does not expose.
2. Some workflows silently degrade.
3. Third-party ports introduce additional abstractions and version drift.
4. Package version numbers do not clearly communicate upstream pstack compatibility.
5. Long-running workflows need explicit crash recovery and durable state.
6. Parallel agents require isolation and dependency-aware scheduling.
7. Upstream synchronization becomes manual and difficult to audit.

`pi-pstack-native` solves these by separating:

- **pstack semantics**
- **Pi-native execution**
- **upstream content synchronization**

---

## 2.2 Product statement

`pi-pstack-native` is:

> A durable, Pi-native execution environment for pstack workflows, implemented directly on official Pi APIs.

It should feel like pstack to the operator:

- `/poteto-mode`
- playbook routing
- engineering principles
- parallel workers
- review panels
- orchestrated execution
- durable unattended work
- model-role routing
- verification-first behavior

But internally it should behave like a native Pi system.

---

# 3. Goals

## 3.1 Primary goals

### G1. Semantic pstack parity

Implement the behavior of upstream pstack workflows as faithfully as practical.

Parity is defined by behavior, not implementation details.

Example:

```text
Cursor Task(...)
```

does not need to exist in Pi.

The required semantic behavior is:

```text
spawn one isolated worker using the selected role/model,
track it,
collect the result,
and use that result in the parent workflow.
```

### G2. Official-Pi-only runtime

No third-party runtime dependency may be required to:

- spawn agents
- run graphs
- persist workflow state
- manage worktrees
- route models
- schedule loops
- resume interrupted work
- manage child-agent communication

### G3. Durable execution

A workflow must survive:

- Pi restart
- terminal closure
- process crash
- temporary provider errors
- parent session suspension
- machine restart, when the underlying persisted state remains available

Completed work must not be repeated unless explicitly requested.

### G4. Explicit workflow state

Every non-trivial pstack workflow should have inspectable state.

The system must know:

- what workflow is running
- what calls exist
- which calls are pending/running/completed/failed
- which results are dependencies
- which agent session owns each call
- which worktree belongs to each call
- which model was selected
- what remains to be done

### G5. Reproducible upstream synchronization

Every upstream pstack file must be classified as one of:

- `IDENTICAL`
- `ADAPTED`
- `PI_ONLY`
- `CURSOR_ONLY`
- `UNSUPPORTED`
- `PENDING_PORT`

The package must never claim full parity while files remain `PENDING_PORT`.

### G6. Maintainability

A future upstream pstack release should be synchronizable through a repeatable process:

```text
fetch upstream
→ diff against pinned upstream
→ classify changed files
→ apply safe transforms
→ surface semantic conflicts
→ run parity tests
→ update pin
```

---

# 4. Non-goals

## NG1. Exact Cursor internal behavior

The project will not reproduce Cursor implementation details when a Pi-native equivalent exists.

## NG2. Operating-system-level background daemon

`0.3.0` will not install a permanent OS daemon or launch agent.

A scheduled workflow runs while Pi is active.

If Pi is closed, the schedule is persisted and can be resumed when the relevant session/runtime starts again.

An OS-level scheduler may be considered later as an optional integration.

## NG3. Perfect byte-for-byte pstack source parity

pstack content can be adapted when Cursor-specific instructions would be incorrect on Pi.

## NG4. Reimplementing official Pi primitives

The project should not recreate model provider clients, conversation persistence primitives, core session machinery, or durable storage engines when official Pi packages already provide them.

---

# 5. Target users

## 5.1 Primary user

A developer using Pi as their main coding-agent environment who wants:

- pstack-style rigor
- long-running autonomous work
- parallel agents
- review workflows
- crash recovery
- controllable model routing

without depending on several independent third-party extensions.

## 5.2 Secondary user

A pstack user moving from Cursor to Pi who wants familiar semantics.

## 5.3 Maintainer

A package maintainer who needs to keep Pi behavior aligned with new upstream pstack releases.

---

# 6. Product principles

## P1. Semantics over syntax

Port the intended behavior, not Cursor syntax.

## P2. State must be inspectable

Anything durable must expose enough state to understand why it is running, blocked, failed, or complete.

## P3. No silent degradation

If a Cursor feature has no Pi-native equivalent, the port must either implement an explicit substitute, mark the capability unsupported, or stop with a clear error. It must not silently ignore the behavior.

## P4. Exactly-once intent, at-least-once reality

Workflow orchestration should avoid repeating completed logical steps. External side effects cannot always be exactly-once. Therefore every tool/action that can produce an external side effect must support idempotency where possible, precondition checks, durable receipts, and human confirmation when required.

## P5. Safe parallelism

Parallel execution must isolate writers by default.

## P6. User control beats autonomy

Durability and scheduling must never make a workflow impossible to stop.

---

# 7. Dependency policy

## 7.1 Allowed runtime dependencies

Required:

```json
{
  "@earendil-works/pi-coding-agent": "^1.1.0",
  "@earendil-works/pi-durable": "^1.1.0"
}
```

Optional if implementation requires them directly:

```json
{
  "@earendil-works/pi-ai": "^1.1.0",
  "@earendil-works/pi-tui": "^1.1.0"
}
```

Node built-ins are allowed.

## 7.2 Forbidden runtime dependencies

The runtime must not depend on:

```text
@whamp/pi-pstack
pi-subagents
pi-durable-subagents
pi-agents
external DAG frameworks
external scheduler frameworks
external worktree managers
```

Development-only utilities may be considered separately, but core behavior must remain self-contained.

---

# 8. High-level architecture

```text
                           ┌──────────────────────────┐
                           │      pstack upstream      │
                           │   cursor/plugins/pstack   │
                           └─────────────┬────────────┘
                                         │
                                         ▼
                           ┌──────────────────────────┐
                           │   Upstream Sync Compiler  │
                           │ classify / adapt / verify │
                           └─────────────┬────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         pi-pstack-native                         │
│                                                                 │
│  ┌──────────────────┐       ┌────────────────────────────────┐  │
│  │ pstack content    │       │ Native Runtime                 │  │
│  │ skills/playbooks  │       │                                │  │
│  │ principles        │       │ AgentHost                      │  │
│  │ agents            │       │ WorkflowEngine                 │  │
│  └────────┬─────────┘       │ GraphScheduler                 │  │
│           │                  │ WorktreeManager                │  │
│           │                  │ ModelRouter                    │  │
│           │                  │ DurableStore                   │  │
│           │                  │ LoopScheduler                  │  │
│           │                  │ Mailbox/EventBus               │  │
│           │                  └───────────────┬────────────────┘  │
│           └──────────────────────────────────┘                   │
└──────────────────────────────────────────────┬───────────────────┘
                                               │
                                               ▼
                             ┌────────────────────────────┐
                             │ Official Pi packages       │
                             │                            │
                             │ pi-coding-agent            │
                             │ pi-durable                 │
                             │ pi-ai                      │
                             │ pi-tui                     │
                             └────────────────────────────┘
```

---

# 9. Runtime modules

## 9.1 AgentHost

`AgentHost` owns child agent lifecycle.

Responsibilities:

- create agent sessions
- assign role/profile
- assign model
- assign tools
- assign cwd/worktree
- persist agent identity
- resume existing agent session
- stop/cancel agent
- collect final result
- stream state changes into workflow state

Conceptual interface:

```ts
interface AgentHost {
  spawn(spec: AgentSpawnSpec): Promise<AgentHandle>;
  resume(agentId: string): Promise<AgentHandle>;
  send(agentId: string, message: string): Promise<void>;
  stop(agentId: string, reason?: string): Promise<void>;
  status(agentId: string): Promise<AgentStatus>;
}
```

## 9.2 Agent profiles

Built-in initial profiles:

```text
worker
reviewer
scout
architect
verifier
integrator
synthesizer
poteto-agent
comment-sicko
```

Profile definition:

```ts
interface AgentProfile {
  name: string;
  description: string;
  tools: string[];
  writable: boolean;
  defaultIsolation: "shared" | "worktree" | "readonly";
  defaultRole: string;
  systemPrompt?: string;
}
```

## 9.3 ModelRouter

Model routing replaces Cursor pstack model rules.

Config location:

```text
~/.pi/agent/pstack-native/models.json
```

Example:

```json
{
  "version": 1,
  "thinkingLevel": "inherit-parent",
  "roles": {
    "worker": "inherit-parent",
    "reviewer": "inherit-parent",
    "architect": "inherit-parent",
    "verifier": "inherit-parent"
  }
}
```

Supported selectors:

```text
inherit-parent
auto
provider/model selector
```

Requirements:

- validate configured models against Pi's available model registry
- preserve parent model when `inherit-parent`
- provide fallback behavior only when explicitly defined
- record actual selected model in workflow state

Commands:

```text
/setup-pstack
/pstack-models
```

---

# 10. Durable state model

## 10.1 Storage

Default runtime state root:

```text
~/.pi/agent/pstack-native/
```

Suggested layout:

```text
~/.pi/agent/pstack-native/
├── config.json
├── models.json
├── workflows/
│   ├── wf_<id>.json
│   └── ...
├── agents/
│   ├── ag_<id>.json
│   └── ...
├── journals/
│   ├── wf_<id>.jsonl
│   └── ...
├── loops/
│   └── loops.json
├── locks/
├── receipts/
└── runtime/
```

Where practical, persistence should use official `pi-durable` storage primitives rather than bespoke storage code.

## 10.2 Workflow entity

```ts
interface WorkflowRecord {
  id: string;
  name?: string;

  type:
    | "single"
    | "parallel"
    | "chain"
    | "graph"
    | "swarm"
    | "arena"
    | "orchestrate"
    | "review"
    | "loop";

  state:
    | "created"
    | "running"
    | "blocked"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";

  createdAt: string;
  updatedAt: string;
  parentSessionId?: string;
  calls: Record<string, WorkflowCall>;
  edges: WorkflowEdge[];
  result?: unknown;
  error?: DurableError;

  upstreamContext?: {
    pstackVersion: string;
    playbook?: string;
    skill?: string;
  };
}
```

## 10.3 Workflow call

```ts
interface WorkflowCall {
  key: string;
  agentId?: string;
  profile: string;
  task: string;

  state:
    | "pending"
    | "ready"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled"
    | "skipped";

  attempt: number;
  dependsOn: string[];
  model?: string;
  cwd?: string;
  worktree?: string;
  startedAt?: string;
  finishedAt?: string;
  result?: unknown;
  error?: DurableError;
}
```

---

# 11. WorkflowEngine

`WorkflowEngine` executes workflow graphs.

Core operations:

```ts
workflow.run();
workflow.pause();
workflow.resume();
workflow.cancel();
workflow.status();
workflow.retry();
```

## 11.1 Supported graph patterns

### Single

```text
A
```

### Parallel fan-out

```text
A
B
C
```

### Chain

```text
A → B → C
```

### Fan-out / merge

```text
A ─┐
B ─┼→ D
C ─┘
```

### Diamond

```text
    B
  ↗   ↘
A       D
  ↘   ↗
    C
```

### Worker/verifier pair

```text
worker → verifier
```

### Refillable worker pool

```text
queue
 │
 ├→ W1 → V1
 ├→ W2 → V2
 ├→ W3 → V3
 └→ next job as capacity becomes available
```

## 11.2 Graph rules

The graph engine must:

- reject cycles
- reject duplicate call keys
- start a call only when all dependencies succeed
- support dependency failure policies
- persist transition before irreversible work when possible
- restore the graph after process restart
- not rerun completed nodes automatically
- expose deterministic status

---

# 12. Agent lifecycle

## 12.1 Spawn

```text
resolve profile
→ resolve model
→ resolve isolation
→ create workspace
→ create durable agent record
→ create AgentSession
→ execute
→ checkpoint progress
→ finalize result
```

## 12.2 Resume

When recovering:

```text
load agent record
→ locate persisted session
→ inspect workflow state
→ resume only unfinished call
```

## 12.3 Cancellation

Cancellation must:

1. mark the workflow/call as cancellation-requested
2. attempt to stop the active session
3. record final cancellation state
4. preserve worktree unless cleanup policy says otherwise

---

# 13. WorktreeManager

## 13.1 Purpose

Independent parallel write-capable agents must not modify the same checkout by default. A single writer may use the target checkout; writable chains continue in one lane; multi-writer convergence requires an explicit integrator.

## 13.2 Modes

```text
shared
readonly
worktree
```

Default policies:

| Profile | Default |
|---|---|
| worker | shared for a single lane; workflow isolates independent parallel roots |
| architect | shared for a single lane; workflow isolates independent parallel roots |
| verifier | readonly on the directly dependent artifact |
| reviewer | readonly on the directly dependent artifact |
| scout | readonly |
| integrator | shared target checkout; explicit multi-writer convergence owner |
| synthesizer | readonly |
| comment-sicko | readonly |

## 13.3 Worktree record

```ts
interface WorktreeRecord {
  id: string;
  path: string;
  branch: string;
  baseRef: string;
  ownerAgentId: string;
  createdAt: string;
}
```

## 13.4 Safety requirements

The runtime must not:

- delete a worktree with uncommitted user work without confirmation
- force-delete unknown worktrees
- overwrite an existing branch
- assume `main` is the default branch

---

# 14. Mailbox and agent communication

Support:

```text
parent → child steer
parent → child follow-up
child → parent question
child → parent result
parent → child stop
```

Conceptual API:

```ts
agent.send(agentId, message);
agent.answer(questionId, answer);
agent.stop(agentId);
```

Messages must be durably recorded where they affect workflow behavior.

---

# 15. Native tools exposed to the model

## `pstack_agents`

Actions:

```text
spawn
send
stop
status
list
```

## `pstack_workflow`

Actions:

```text
run
status
pause
resume
cancel
retry
```

## `pstack_graph`

Convenience API for graph execution.

Supported specs:

```text
parallel
chain
graph
worker-verifier
```

Tool policy: the model should prefer pstack-native tools over shelling out to Pi subprocesses.

---

# 16. Poteto Mode

## 16.1 Command

```text
/poteto-mode
/poteto-mode <task>
/poteto-mode off
```

Behavior:

- sticky within the Pi session
- stored in session custom entries
- restored when resuming the same session
- injects only a lightweight system prompt
- loads full skills only when required

## 16.2 Routing

Poteto Mode must:

1. classify request
2. choose a playbook
3. materialize playbook steps
4. mark skipped steps explicitly
5. invoke other skills when required
6. use native agent/workflow tools for delegation
7. cite applicable principles in the final response when the upstream playbook requires it

---

# 17. pstack playbook compatibility

Target categories:

- bug fix
- feature
- refactor
- performance
- hillclimb
- investigation
- architecture
- review
- opening a PR
- babysit
- shipping
- session pickup
- pause safely
- multi-phase plan
- autonomous run
- autopilot
- orchestrate
- eval
- skill authoring
- verification workflows

Each playbook receives a parity record.

Example:

```yaml
name: orchestrate
status: ADAPTED
upstream_version: 0.15.15
runtime:
  cursor: Task + cloud agents
  pi: pstack_workflow + worktree isolation
tests:
  - parallel workers refill on completion
  - verifier depends on worker result
  - completed unit never reruns after resume
```

---

# 18. Scheduler and `/pstack-loop`

## 18.1 Commands

```text
/pstack-loop 20m <task>
/pstack-loop 1h <task>
/pstack-loop 1d <task>

/pstack-loop list
/pstack-loop status <id>
/pstack-loop run <id>
/pstack-loop pause <id>
/pstack-loop resume <id>
/pstack-loop stop <id>
```

## 18.2 Semantics

While Pi is active:

```text
timer
→ trigger durable workflow
→ record result
→ calculate next run
```

When Pi is closed:

- no claim is made that work continues
- next run time remains persisted

When Pi resumes:

- if one or more runs were missed, execute at most one catch-up run
- do not replay every missed interval
- compute next run from current time unless the schedule explicitly requires wall-clock anchoring

## 18.3 Scheduler state

```ts
interface LoopRecord {
  id: string;
  sessionId: string;
  intervalMs: number;
  task: string;
  enabled: boolean;
  runningWorkflowId?: string;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt: string;
  missedPolicy: "run-once" | "skip";
}
```

Default:

```text
missedPolicy = run-once
```

---

# 19. `/setup-pstack`

The setup experience must be native to Pi.

It should configure:

- default execution budget
- worker model
- reviewer model
- architect model
- verifier model
- synthesizer model
- optional panel models
- default concurrency
- default isolation mode

Example output:

```json
{
  "version": 1,
  "budget": "high",
  "concurrency": 4,
  "roles": {
    "worker": "inherit-parent",
    "reviewer": "inherit-parent",
    "architect": "inherit-parent",
    "verifier": "inherit-parent",
    "synthesizer": "inherit-parent"
  }
}
```

---

# 20. Runtime commands

Required commands:

```text
/poteto-mode
/setup-pstack
/pstack status
/pstack on
/pstack off
/pstack-runtime
/pstack-upstream
/pstack-parity
/pstack-agents
/pstack-workflows
/pstack-loop
```

---

# 21. `/pstack-runtime`

Example:

```text
pi-pstack-native 0.3.0

Package
  npm name: 2333
  project: pi-pstack-native

Upstream
  pstack: 0.15.15
  commit: <sha>

Runtime
  Pi Coding Agent: 1.1.x
  Pi Durable: 1.1.x

Dependencies
  third-party runtime dependencies: none

Agent runtime
  native AgentSession

Workflow engine
  native durable DAG

Scheduler
  native session scheduler

Worktree isolation
  native git worktrees
```

---

# 22. Upstream sync compiler

## 22.1 Inputs

```text
cursor/plugins
path: pstack/
pinned commit: <sha>
pinned version: <version>
```

## 22.2 File classes

Every upstream file must map to exactly one class.

### `IDENTICAL`

Copied byte-for-byte.

### `ADAPTED`

Semantic content retained, runtime-specific parts translated.

### `PI_ONLY`

Exists only in `pi-pstack-native`.

### `CURSOR_ONLY`

Cannot or should not exist in Pi.

### `UNSUPPORTED`

Known upstream capability with no implementation. Must include reason.

### `PENDING_PORT`

Changed upstream content that has not yet been reviewed.

A release cannot claim full parity while this count is nonzero.

## 22.3 Sync process

```text
fetch pinned upstream
     ↓
fetch new upstream
     ↓
calculate changed paths
     ↓
classify each path
     ↓
safe automatic transforms
     ↓
semantic conflict detection
     ↓
manual adaptation where required
     ↓
run parity suite
     ↓
update UPSTREAM.json
     ↓
generate PARITY.md
```

---

# 23. Upstream metadata

`UPSTREAM.json`:

```json
{
  "source": "cursor/plugins",
  "path": "pstack",
  "version": "0.15.15",
  "commit": "<sha>",
  "syncedAt": "2026-10-10T00:00:00Z"
}
```

The npm package version is independent.

Example:

```text
2333@0.3.0
upstream pstack 0.15.15
```

---

# 24. Parity manifest

`PARITY.json` should be machine-readable.

Example:

```json
{
  "upstream": "0.15.15",
  "skills": {
    "poteto-mode": "ADAPTED",
    "correct": "IDENTICAL",
    "poteto-help": "ADAPTED"
  },
  "playbooks": {
    "orchestrate": "ADAPTED"
  },
  "cursorOnly": [
    "make-bot-ui"
  ],
  "pending": []
}
```

Generate human-readable `PARITY.md` from it.

---

# 25. pstack semantic mapping

| Cursor pstack concept | Pi-native implementation |
|---|---|
| Task subagent | AgentHost + AgentSession |
| parallel Tasks | WorkflowEngine parallel graph |
| cloud agent | worktree-isolated AgentSession |
| model role rule | ModelRouter config |
| Custom Mode | sticky Poteto Mode |
| agent transcript | Pi session + durable agent record |
| Task result | durable WorkflowCall result |
| fresh subagent | new AgentSession |
| swarm | fan-out workflow |
| arena | parallel candidates + judge |
| interrogate | reviewer panel |
| orchestrate | durable refillable graph |
| autopilot | durable workflow state machine |
| `/loop` | pstack native scheduler |
| crash recovery | persistent Pi child sessions + pstack-native atomic workflow journal |

---

# 26. Swarm

Required behavior:

```text
input slices
→ parallel workers
→ collect all results
→ synthesizer
```

Properties:

- bounded concurrency
- isolated write workers
- no duplicate slice execution after resume
- failed slices visible individually
- optional fail-fast or best-effort policy

---

# 27. Arena

Required behavior:

```text
same brief
→ candidate A
→ candidate B
→ candidate C
→ judge
→ merged/final result
```

Judge must not share mutable write state with candidates.

---

# 28. Interrogate / review panels

Panel execution:

```text
diff/spec
  ├→ reviewer model A
  ├→ reviewer model B
  └→ reviewer model C
          ↓
      synthesizer
```

Requirements:

- reviewer sessions read-only by default
- preserve model identity with each finding
- synthesizer must not erase disagreement
- support one or multiple configured reviewers

---

# 29. Orchestrate

This is the most important parity workflow.

## 29.1 Required behavior

- break program into units
- run up to configured concurrency
- pair completed units with verification
- refill capacity as calls finish
- persist program state
- survive restart
- never rerun completed units without explicit reset
- keep evidence associated with each unit

## 29.2 State machine

```text
planned
  ↓
worker-ready
  ↓
worker-running
  ↓
worker-complete
  ↓
verifier-ready
  ↓
verifier-running
  ↓
verified / rejected
```

Rejected work can produce:

```text
retry
rework
blocked
human-required
```

---

# 30. Autopilot

Autopilot is implemented as a durable state machine, not a long prompt.

Example states:

```text
inspect
plan
execute
verify
review
fix
reverify
prepare-pr
wait-ci
respond-review
complete
```

Every transition must be persisted.

---

# 31. External side effects

Durability cannot guarantee that an external action did not happen before a crash.

Examples:

- pushing git commits
- posting PR comments
- merging
- creating an issue
- calling a remote API

Therefore, before retrying an external side effect, the runtime must attempt to determine whether the effect already occurred.

Each effect should store a receipt:

```ts
interface EffectReceipt {
  id: string;
  kind: string;
  requestFingerprint: string;
  attemptedAt: string;
  confirmedAt?: string;
  externalId?: string;
  result?: unknown;
}
```

---

# 32. Safety

## 32.1 Destructive operations

Require confirmation for:

- force push
- deleting unmerged branches
- deleting worktrees with unknown changes
- merging when workflow does not already contain user approval
- destructive filesystem operations outside owned workspaces

## 32.2 Tool boundaries

Reviewer profiles should not have write tools.

## 32.3 Workspace ownership

Every runtime-created directory must have an ownership marker.

Never clean up unknown directories.

---

# 33. Observability

## 33.1 `/pstack-workflows`

Example:

```text
wf_123  orchestrate  running

worker-api       completed
worker-ui        running
worker-tests     completed
verify-api       completed
verify-tests     ready
merge-review     blocked

2 active / 6 total
```

## 33.2 `/pstack-agents`

Example:

```text
ag_1 worker     opus-xhigh  completed
ag_2 worker     grok-fast   running
ag_3 reviewer   opus-xhigh  waiting
```

## 33.3 TUI

Optional later stage:

- status footer
- workflow panel
- agent panel

`0.3.0` does not require a sophisticated TUI if commands provide full observability.

---

# 34. Error model

All durable errors should contain:

```ts
interface DurableError {
  code: string;
  message: string;
  retryable: boolean;
  cause?: string;
  occurredAt: string;
}
```

Categories:

```text
MODEL_UNAVAILABLE
PROVIDER_ERROR
SESSION_ERROR
WORKTREE_ERROR
TOOL_ERROR
DEPENDENCY_FAILED
CANCELLED
TIMEOUT
INVALID_GRAPH
STATE_CORRUPTION
UPSTREAM_PARITY_ERROR
```

---

# 35. Retry policy

Default automatic retry:

- transient model/provider failure: yes, bounded
- invalid task/schema: no
- failed verification: no automatic retry unless playbook says rework
- external side effect uncertainty: inspect first
- worktree conflict: no silent force

---

# 36. Concurrency

Default global concurrency:

```text
4
```

Configurable.

The runtime must distinguish:

- active model calls
- active write worktrees
- workflow queue length

Concurrency limits must apply across a workflow, not separately to every branch.

---

# 37. Resource budgets

Future-compatible structure:

```ts
interface WorkflowBudget {
  maxCalls?: number;
  maxTokens?: number;
  maxCostUsd?: number;
  maxWallTimeMs?: number;
}
```

`0.3.0` should at minimum support:

```text
maxCalls
maxConcurrency
```

Token/cost integration may follow if official Pi runtime exposes reliable usage information at the required boundary.

---

# 38. Session ownership

A workflow belongs to its origin Pi session but can survive the current agent turn.

Rules:

- resuming the originating Pi session surfaces pending workflow state
- an explicit workflow ID can be resumed where supported
- multiple parents must not concurrently own the same writable workflow
- use durable locks to prevent split-brain execution

---

# 39. Locking

Required locks:

```text
workflow execution lock
agent execution lock
worktree mutation lock
scheduler loop lock
```

Lock acquisition must be bounded and observable.

---

# 40. Configuration

Global config:

```text
~/.pi/agent/pstack-native/config.json
```

Example:

```json
{
  "version": 1,
  "skillsEnabled": true,
  "defaultConcurrency": 4,
  "loopMissedPolicy": "run-once"
}
```

---

# 41. Package layout

```text
pi-pstack-native/
├── package.json
├── README.md
├── LICENSE
├── NOTICE.md
├── PRD.md
├── UPSTREAM.json
├── PARITY.json
├── PARITY.md
│
├── src/
│   ├── extension.ts
│   │
│   ├── agent/
│   │   ├── host.ts
│   │   ├── profiles.ts
│   │   ├── session.ts
│   │   └── mailbox.ts
│   │
│   ├── workflow/
│   │   ├── engine.ts
│   │   ├── graph.ts
│   │   ├── scheduler.ts
│   │   ├── state.ts
│   │   └── recovery.ts
│   │
│   ├── durable/
│   │   ├── store.ts
│   │   ├── locks.ts
│   │   ├── journal.ts
│   │   └── receipts.ts
│   │
│   ├── worktree/
│   │   ├── manager.ts
│   │   └── git.ts
│   │
│   ├── models/
│   │   ├── router.ts
│   │   └── config.ts
│   │
│   ├── loop/
│   │   ├── store.ts
│   │   └── runner.ts
│   │
│   ├── commands/
│   │   ├── poteto-mode.ts
│   │   ├── setup-pstack.ts
│   │   ├── pstack-runtime.ts
│   │   ├── pstack-upstream.ts
│   │   ├── pstack-workflows.ts
│   │   └── pstack-loop.ts
│   │
│   └── tools/
│       ├── agents.ts
│       ├── workflow.ts
│       └── graph.ts
│
├── agents/
│   ├── worker.md
│   ├── reviewer.md
│   ├── verifier.md
│   ├── architect.md
│   ├── poteto-agent.md
│   └── comment-sicko.md
│
├── skills/
│   └── ...
│
├── scripts/
│   ├── sync-upstream.mjs
│   ├── classify-upstream.mjs
│   ├── generate-parity.mjs
│   └── verify-parity.mjs
│
└── test/
    ├── agent/
    ├── workflow/
    ├── durable/
    ├── worktree/
    ├── loop/
    ├── parity/
    └── integration/
```

---

# 42. Package manifest

Target:

```json
{
  "name": "2333",
  "version": "0.3.0",
  "type": "module",
  "engines": {
    "node": ">=22.19.0"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^1.1.0",
    "@earendil-works/pi-durable": "^1.1.0"
  },
  "pi": {
    "extensions": [
      "./src/extension.ts"
    ],
    "skills": [
      "./skills"
    ]
  }
}
```

If direct imports are needed, `@earendil-works/pi-ai` and `@earendil-works/pi-tui` must be explicitly declared rather than relying on transitive dependencies.

---

# 43. Migration from 0.2.0

`0.2.0` used external runtime packages.

`0.3.0` removes them.

Migration rules:

1. Existing pstack model config should be imported when possible.
2. Existing `/pstack-loop` entries should be migrated to the new loop schema.
3. Running third-party workflows cannot be transparently resumed.
4. Migration must clearly state that in-flight 0.2 workflows are not portable.
5. Existing user source worktrees must not be deleted.

---

# 44. Compatibility with existing Whamp configuration

Read-only migration support may detect:

```text
~/.pi/agent/pstack/models.json
```

and offer to import it.

The runtime must not keep Whamp as a dependency.

---

# 45. Licensing and attribution

Requirements:

- preserve upstream pstack MIT license obligations
- retain Lauren Tan attribution for copied/substantially derived pstack content
- clearly distinguish new `pi-pstack-native` code from upstream content
- include `NOTICE.md`
- include upstream repository and pinned revision

---

# 46. Testing strategy

## 46.1 Unit tests

Agent runtime:

- role resolution
- model resolution
- tool restriction
- agent record serialization

Workflow:

- cycle rejection
- dependency execution
- fan-out
- merge
- retry
- cancellation

Scheduler:

- interval parsing
- next-run calculation
- catch-up policy
- pause/resume

Worktrees:

- create
- branch collision
- dirty cleanup protection

## 46.2 Durable recovery tests

Test:

```text
start workflow
complete A
start B
simulate process death
reload state
assert A not rerun
assert B resumes/retries according to state
assert C remains blocked until dependencies complete
```

## 46.3 Crash boundary tests

Simulate failure:

- before agent spawn
- after agent spawn before state update
- after completion before result acknowledgement
- before external side effect
- after external side effect but before receipt commit

## 46.4 Integration tests

Use real Pi session SDK with deterministic/mock model where possible.

Validate:

- child session creation
- child tool boundaries
- result propagation
- parent wake-up
- resume

## 46.5 Parity tests

For each adapted upstream skill/playbook:

- assert required semantics exist
- assert Cursor-only terminology does not instruct impossible actions
- assert native runtime mappings are present

---

# 47. Acceptance criteria for 0.3.0

`0.3.0` is complete when all of the following are true.

## Runtime

- [ ] No runtime dependency outside official `@earendil-works/*`
- [ ] Native child-agent spawn works
- [ ] Native agent status works
- [ ] Native send/stop works
- [ ] Agent roles enforce tool permissions

## Workflow

- [ ] Parallel graph works
- [ ] Chain works
- [ ] Fan-out/merge works
- [ ] Worker/verifier graph works
- [ ] Workflow state persists
- [ ] Completed graph nodes do not rerun after restart

## Isolation

- [x] Independent parallel writers use worktrees; single-writer work lands in the target checkout; multi-writer delivery requires an integrator
- [ ] Read-only agents cannot write
- [ ] Worktree cleanup is safe

## Scheduler

- [ ] `/pstack-loop` persists
- [ ] Catch-up policy works
- [ ] Loop can be listed/paused/resumed/stopped

## pstack UX

- [ ] `/poteto-mode`
- [ ] `/setup-pstack`
- [ ] `/pstack-runtime`
- [ ] `/pstack-upstream`
- [ ] `/pstack-parity`

## Upstream

- [ ] Every upstream file classified
- [ ] No unknown changed files
- [ ] `PENDING_PORT = 0` for features claimed as supported
- [ ] package displays exact upstream pstack version and commit

---

# 48. Full semantic parity criteria

The project may claim:

```text
Full semantic parity with pstack <version>
```

only if:

1. every upstream skill is classified,
2. every playbook is classified,
3. every supported workflow has parity tests,
4. every Cursor-only behavior has an explicit Pi equivalent or explicit unsupported classification,
5. there are no `PENDING_PORT` entries,
6. no known critical behavior silently degrades.

---

# 49. Release phases

## Phase 1 — Native runtime foundation

Deliver:

- AgentHost
- ModelRouter
- role profiles
- durable records
- basic tools

## Phase 2 — Workflow engine

Deliver:

- graph model
- parallel/chain/merge
- recovery
- cancellation
- status

## Phase 3 — Isolation and verification

Deliver:

- WorktreeManager
- reviewer permissions
- verifier workflow

## Phase 4 — Scheduler

Deliver:

- `/pstack-loop`
- persisted schedules
- resume semantics

## Phase 5 — pstack skill migration

Move from existing bridge content to:

```text
upstream content
+
native runtime adaptation
```

without Whamp runtime dependency.

## Phase 6 — 0.15.15 parity pass

Audit every upstream pstack path at the pinned version.

Generate final `PARITY.md`.

## Phase 7 — hardening

- crash tests
- provider failures
- worktree conflicts
- state corruption
- concurrency stress
- migration tests

---

# 50. Future roadmap

Possible later features:

- OS-level scheduler integration
- richer TUI workflow graph
- cross-session workflow takeover
- remote durable storage
- remote workers
- workflow export/import
- cost budgets
- replay debugger
- workflow timeline viewer
- automatic upstream parity pull requests

---

# 51. Open engineering questions

## Q1. Durable session persistence boundary

Determine the cleanest supported combination of Pi `AgentSession`, `SessionManager`, and Pi Durable records for child-session restoration.

## Q2. Parent wake-up

Determine whether completed child workflows should trigger a Pi custom message, wait until next user turn, or use a configurable behavior.

Default recommendation:

```text
wake parent on workflow completion or blocking human question
```

## Q3. Agent continuation

Determine whether follow-up instructions should reuse the same child session by default.

Recommendation:

```text
same logical call → reuse session
fresh worker step → new session
```

## Q4. Git integration

Decide whether initial 0.3.0 needs branch creation automatically or only worktree isolation.

Recommendation: implement both together because writable worktrees need a clear branch owner.

## Q5. Scheduler ownership

Loops should remain attached to the creating Pi session initially.

Cross-session/global loops can come later.

---

# 52. Definition of done

The project is considered successfully redesigned when the following statement is true:

> `2333` can execute pstack-style multi-agent workflows, resume them after interruption, isolate concurrent writers, route models by role, run scheduled pstack checks, and report exact upstream compatibility while depending only on official Pi runtime packages.

The implementation should no longer require a user to understand or install:

```text
Whamp pstack
pi-subagents
pi-durable-subagents
pi-agents
```

The user installs one package:

```bash
pi install npm:2333
```

and receives one coherent Pi-native pstack runtime.

---

# 53. Recommended release identity

Package:

```text
2333
```

Project:

```text
pi-pstack-native
```

Release:

```text
0.3.0
```

Positioning:

> pstack semantics, rebuilt natively for Pi.

Upstream display:

```text
pi-pstack-native 0.3.0
upstream pstack 0.15.15
Pi-native runtime
third-party runtime dependencies: none
```

---

# 54. Final architectural decision

The project should proceed with the following rule:

> Official Pi packages provide the platform. `pi-pstack-native` owns everything pstack-specific above that platform.

That includes:

```text
agent lifecycle
agent profiles
workflow graphs
orchestration
durability policy
recovery
model roles
worktree isolation
scheduler
Poteto runtime
upstream compatibility
parity verification
```

This gives the project a stable boundary:

```text
pstack semantics
      ↓
pi-pstack-native
      ↓
official Pi APIs
```

instead of a stack of independently versioned third-party runtimes.

---

## Implementation decision for 0.3.0

During implementation, the official Pi APIs exposed two separate conversation runtimes: `@earendil-works/pi-coding-agent` `AgentSession` (which already owns Pi auth, model registry, extensions, tools, skills, and session files) and the lower-level `@earendil-works/pi-durable` Harness (which expects its own model/provider registry and conversation host).

`0.3.0` therefore does **not** open a second Durable Harness inside the extension. Child agents use official persistent Pi `AgentSession` + `SessionManager`, while pstack-specific workflow state uses an atomic native journal under `~/.pi/agent/pstack-native/`. This avoids duplicating model/auth/tool state and avoids split ownership of one child conversation. The workflow storage boundary is isolated behind `src/runtime/store.ts`, so a future official bridge between Coding Agent sessions and Pi Durable can replace it without changing pstack workflow semantics.

This is an intentional implementation refinement of the earlier dependency sketch: the release still has no non-official runtime dependencies, but it does not claim that its workflow journal is `@earendil-works/pi-durable` storage.


---

# 55. 0.3.0 implementation status (authoritative)

This section records the final implementation choices and overrides stale planning examples above where they differ.

## Implemented

- Native child sessions use official Pi `createAgentSession()` + persistent `SessionManager`.
- Workflow DAG state uses pstack-native atomic JSON records plus append-only journals. Completed calls do not rerun after process recovery; interrupted child sessions reopen and resume.
- Process/file locks verify owner PIDs. A fresh lock from a dead process is recovered immediately; a live owner is never stolen.
- One simple writer may edit the target checkout. Independent parallel root writers use separate worktrees. Writable chains continue in the predecessor workspace.
- A workflow with several writable artifacts must converge through profile `integrator` before combined verification. Reviewer/verifier nodes with several writer dependencies are rejected until an integrator exists.
- Standalone background writable child starts default to worktree isolation.
- Reviewer is read-only. Verifier has read/search/bash but no edit/write. Pi-native `grep`, `find`, and `ls` are path-confined read-only tools because Pi 1.1's default built-ins are `read`, `bash`, `edit`, and `write`.
- `/setup-pstack` configures role models plus one global child reasoning level. Unsupported explicit reasoning levels fail closed for the resolved model.
- `/pstack-loop` persists schedules, uses a cross-process update lock, runs only while Pi is active, and catches up at most one missed run on session resume.
- The semantic port contains all 51 upstream top-level skill names and all 23 Poteto playbooks at pstack 0.15.15; `make-bot-ui` is explicit Cursor-only.

## Dependency refinement

The original architecture allowed direct use of `@earendil-works/pi-durable`. The shipped 0.3.0 extension does not instantiate a second Durable Harness. Pi Coding Agent already owns model/auth/tool/session lifecycle for `AgentSession`; opening an independent Harness would split conversation ownership. The orchestration storage boundary is therefore implemented locally and remains replaceable if Pi later exposes an official Coding-Agent/Durable bridge. Runtime dependencies remain official-Pi-only: the host supplies `@earendil-works/pi-coding-agent`; there are no third-party runtime packages.

## Parity claim boundary

`full semantic parity` in this release means the **listed top-level skill/playbook semantics**, not a byte-for-byte mirror of every upstream file. Auxiliary upstream references, scripts, assets, docs, and automations are not individually claimed as vendored or file-level audited. `PARITY.json` marks `fileLevelAudit` as `not-claimed` so this cannot be mistaken for a 128-file source mirror.

## Validation status

The package test suite exercises graph validation, concurrency, recovery, lock recovery, writer/worktree placement, explicit integration, verifier placement, loop locking, model/reasoning routing, path confinement, atomic stores, and dirty-worktree cleanup. A real model/provider child-agent smoke test still requires a consumer Pi installation with Node 22.19+ and configured provider credentials and is therefore recorded as residual risk in `REVIEW.md`.
