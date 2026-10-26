# Pi adapter for the reviewed pstack source

The behavior source is the immutable `vendor/upstream/0.15.17/pstack/` Markdown snapshot at `978ca6e9c0e012047cd5058b8e829240336e704e`. The generated eleven core entrypoints retain its instructions, with platform adaptations in a separate prelude. Do not summarize away upstream rules. Local changes outside these eleven workflows are not semantically audited by this work.

Apply user instructions and repository authority first. Apply the pinned upstream decision rules next, subject only to the explicit overrides below. Never run a Cursor command literally or assume a missing capability completed. Read referenced source Markdown through `pstack_skill` with `upstream/skills/<skill>/...` resource IDs; consume every page. Original relative links resolve within that snapshot. Other plugin skills, private APIs, scripts, control drivers, cloud resources and manifests are not supplied by the Markdown snapshot. Report unavailable dependencies and their effect on the requested outcome.

## Platform substitutions

- Pi Skill frontmatter uses the resource directory name in lowercase kebab case (upstream `Poteto Mode` becomes `poteto-mode`). The upstream body and the original snapshot frontmatter remain intact.

- Task and cloud workers map to `pstack_agents` and `pstack_workflow` Pi AgentSessions. The parent keeps playbook ownership. Parallel writers require separate Git worktrees; integrated delivery requires an explicit integrator followed by verification of the combined artifact. These are local processes, not cloud VMs.
- Resolve model roles through `~/.pi/agent/pstack-native/models.json` (or PSTACK_NATIVE_HOME) and available Pi provider/model selectors. For panels name every seat explicitly. Use `pstack_semantics` panel preflight; no silent provider/model fallback. Unavailable models block the affected seat and must be reported. This deliberately replaces upstream family-default fallback.
- `~/.cursor/rules/pstack-models.mdc`, `.cursor/skills` and Cursor's plugin paths map to Pi configuration and the bundled snapshot. They are not files the Pi worker should create in a user's repository.
- Custom Mode maps to sticky `/poteto-mode`. `/loop` maps to `/pstack-loop`, which needs an active Pi host. Cloud-root hourly execution and exact delivery across a crash are unavailable; report this limitation before promising unattended audit coverage.
- Use a named available CLI/UI driver for real-surface proof. If no driver can reach the surface, return BLOCKED or inconclusive with the exact reason. Unit tests, fake providers, a worker's report or CI alone cannot replace the live lane.

## Explicit policy deviations

- Any head OR base change invalidates native verification and every round receipt, even when stable patch IDs match. Re-run lanes on the current exact pair. Upstream's build-noise/patch-ID reuse exception is intentionally disabled; the stricter native ledger policy remains in force.
- Read-only reviewer/verifier sessions inspect confined source and evidence; they cannot run shell commands. Deterministic commands run in the native verification runner or an authorized writable lane. A separate actor inspects the receipts; a writer cannot countersign its own work.
- The native arena template evaluates each candidate with separate judge nodes rather than one cross-judge that sees all candidates. Use an explicit DAG for the upstream single-cross-judge choreography. Native specialized templates are mechanisms, not automatic completion of a named upstream playbook.
- Native swarm templates cover partition and best-of race. Mixed/first-pass/rank-all require an explicit DAG and declared selection policy; do not silently relabel best-of as first-pass.
- The native autopilot templates prepare local DAG artifacts. Full owner lifecycle, early ready PR, decisions.tsv/children.tsv, periodic audit, rebase discipline, root countersigns and stop propagation remain obligations of the coordinator. The stack template is not a delivered remote PR stack; use stack-plan/stack-open with correct parent worktrees.
- Babysit stops before merge, even when checks are green. Opening a PR does not start a babysit. An explicitly assigned full-autonomy owner may begin its assigned loop after its code-ready report; other agents finish their phase or stack before the handoff. Autopilot-stack stops before shipping. Full-autopilot still needs the operator's go; operator-reserved items never merge automatically. Use `pstack_semantics` round checks before a clean verdict, then native Frontier, ledger and authorization checks for any shipping operation. The round check neither attests the truth of supplied receipts nor authorizes a remote action.

## Unsupported operations

`Cursor-private-PR-provenance`, `Cursor-watch-READY`, `Cursor-cleanup-plugin` and `Bugbot-pass-dismissal` are unsupported. Querying one through `pstack_semantics` fails with an explicit error. GitHub/Origin state and native watch states are usable alternatives only within their own evidence boundary, not proof that a Cursor operation ran. Private provenance, queue verdicts and pass-based dismissal cannot be inferred from green CI. Do not mark a workflow complete when one of its required operations is unavailable.

## Evidence boundary

`SEMANTICS.json` records critical-rule mappings, exact source ranges, deviations, test references and review fingerprints. Inventory counts, mapping coverage, deterministic receipt tests, fake-provider Pi lifecycle tests and real-model runs are separate evidence levels. No mapping asserts complete chat/model equivalence. Updating a fingerprint records review work; it is not semantic approval. The reviewed baseline stays at 0.15.17 until explicit maintainer semantic sign-off. Candidate 0.15.32 remains separate.
