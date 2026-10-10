# Native additions 0.6.0-preview.1

New executable protocols do not claim full Cursor parity. See IMPLEMENTATION.md and ACCEPTANCE.md.

# Native additions 0.6.0-preview.1

Brief/Gate/Ledger/Frontier/Program are native implementations; no full Cursor parity or benchmark efficacy claim. See IMPLEMENTATION.md and ACCEPTANCE.md.

# Native protocol additions (0.6.0-preview.1)

Native Brief/Gate/Ledger/Frontier/Program and typed templates added. No full Cursor parity or efficacy claim. Upstream remains pinned. See IMPLEMENTATION.md and ACCEPTANCE.md.

# Native protocol additions (0.6.0-preview.1)

Brief/Gate/Ledger/Frontier/Program and specialized templates are native implementations. No full Cursor parity or performance claim is made. UPSTREAM.json remains pinned to the uploaded commit. See IMPLEMENTATION.md and ACCEPTANCE.md.

# Native protocol additions (0.6.0-preview.1)

This version adds executable Brief/Gate/Ledger/Frontier/Program semantics and specialized DAG templates. These are native implementations; they do not prove full Cursor parity. UPSTREAM.json remains pinned to the supplied commit. No new claim is made about Cursor private APIs, cloud agents, or benchmark superiority. See IMPLEMENTATION.md and ACCEPTANCE.md for the actual proof boundary.

# pstack 0.15.15 semantic parity

This package targets **top-level semantic parity**, not byte-for-byte or file-for-file Cursor implementation parity. Cursor-only mechanics are replaced with Pi-native behavior. The only explicitly unsupported upstream top-level skill is `make-bot-ui`, whose bot/webhook semantics are Cursor-specific. Auxiliary upstream `references/`, `scripts/`, assets, docs, and automations are not claimed as individually vendored/audited files; required behavior is folded into the adapted skill/playbook where implemented.

## Runtime mapping

| Upstream concept | Native implementation |
|---|---|
| Task subagent | Pi `AgentSession` through `AgentHost` |
| parallel Tasks | persistent DAG workflow engine |
| cloud agent | Pi child session; independent parallel writers use Git worktree isolation |
| model rule | `~/.pi/agent/pstack-native/models.json` |
| Custom Mode | sticky `/poteto-mode` |
| `/loop` | `/pstack-loop` session scheduler (active Pi session, one-run catch-up) |
| interrupted worker | reopen child Pi session and resume |
| several isolated writer outputs | explicit `integrator` node converges into target checkout |

## Skills

| Skill | Status |
|---|---|
| `architect` | ADAPTED |
| `arena` | ADAPTED |
| `automate-me` | ADAPTED |
| `benchmark-checklist` | ADAPTED |
| `blast-radius` | ADAPTED |
| `bro` | ADAPTED |
| `correct` | ADAPTED |
| `create-verification-skill` | ADAPTED |
| `figure-it-out` | ADAPTED |
| `how` | ADAPTED |
| `interrogate` | ADAPTED |
| `maintain-verification-skill` | ADAPTED |
| `make-bot-ui` | CURSOR_ONLY |
| `no-comments` | ADAPTED |
| `poteto-help` | ADAPTED |
| `poteto-mode` | ADAPTED |
| `principle-attack-the-premise` | ADAPTED |
| `principle-boundary-discipline` | ADAPTED |
| `principle-build-the-lever` | ADAPTED |
| `principle-encode-lessons-in-structure` | ADAPTED |
| `principle-exhaust-the-design-space` | ADAPTED |
| `principle-experience-first` | ADAPTED |
| `principle-explain-the-number` | ADAPTED |
| `principle-fix-root-causes` | ADAPTED |
| `principle-foundational-thinking` | ADAPTED |
| `principle-guard-the-context-window` | ADAPTED |
| `principle-laziness-protocol` | ADAPTED |
| `principle-make-operations-idempotent` | ADAPTED |
| `principle-migrate-callers-then-delete-legacy-apis` | ADAPTED |
| `principle-minimize-reader-load` | ADAPTED |
| `principle-model-the-domain` | ADAPTED |
| `principle-never-block-on-the-human` | ADAPTED |
| `principle-outcome-oriented-execution` | ADAPTED |
| `principle-prove-it-works` | ADAPTED |
| `principle-redesign-from-first-principles` | ADAPTED |
| `principle-separate-before-serializing-shared-state` | ADAPTED |
| `principle-sequence-verifiable-units` | ADAPTED |
| `principle-subtract-before-you-add` | ADAPTED |
| `principle-test-behavior-not-implementation` | ADAPTED |
| `principle-type-system-discipline` | ADAPTED |
| `recall` | ADAPTED |
| `reflect` | ADAPTED |
| `setup-pstack` | ADAPTED |
| `show-me-your-work` | ADAPTED |
| `swarm` | ADAPTED |
| `tdd` | ADAPTED |
| `teach` | ADAPTED |
| `technical-writing` | ADAPTED |
| `typescript-best-practices` | ADAPTED |
| `unslop` | ADAPTED |
| `why` | ADAPTED |

## Poteto playbooks

| Playbook | Status |
|---|---|
| `authoring-a-skill` | ADAPTED |
| `autonomous-run` | ADAPTED |
| `autopilot-full` | ADAPTED |
| `autopilot-stack` | ADAPTED |
| `babysit` | ADAPTED |
| `bug-fix` | ADAPTED |
| `eval` | ADAPTED |
| `feature` | ADAPTED |
| `hillclimb` | ADAPTED |
| `investigation` | ADAPTED |
| `multi-phase-plan` | ADAPTED |
| `opening-a-pr` | ADAPTED |
| `orchestrate` | ADAPTED |
| `pause-safely` | ADAPTED |
| `perf-issue` | ADAPTED |
| `prototype` | ADAPTED |
| `refactoring` | ADAPTED |
| `runtime-forensics` | ADAPTED |
| `session-pickup` | ADAPTED |
| `shipping` | ADAPTED |
| `trace-forensics` | ADAPTED |
| `visual-parity` | ADAPTED |
| `worktree-cleanup` | ADAPTED |

## Claim boundary

- `ADAPTED` means the behavior is represented with Pi-native runtime instructions, not that the file matches upstream bytes.
- `CURSOR_ONLY` is explicit and never silently treated as working.
- `PENDING_PORT` must be zero before a release can claim its **listed top-level semantic coverage**.
- This release does **not** claim byte-for-byte or auxiliary-file parity with Cursor pstack.
- `PARITY.json.coverage.fileLevelAudit = "not-claimed"` is intentional; it prevents the 51/23 top-level count from being misread as a 128-file upstream mirror.
