---
name: blast-radius
description: "Find what a change could break outside the diff and prove the key fact that makes it safe by running real code."
disable-model-invocation: true
---
# Blast Radius

Use this for a small diff you do not trust, a risky API/behavior change, or the question “what else could this break?”.

## Procedure

1. **State the change in behavior.** Include hidden effects such as schema, timing, ordering, side effects, generated output, or compatibility.
2. **Trace callers and consumers.** Search imports, call sites, schemas, configs, persistence, tests, docs, build scripts, and external-facing boundaries. Follow behavior, not just symbol names.
3. **Find the safety premise.** Identify the one fact that must be true for the change to be safe. Examples: all callers already pass normalized data; a field is never persisted; no concurrent writer sees the intermediate state.
4. **Prove that premise.** Write or run the cheapest executable check that can falsify it. Prefer a small script, focused test, real request, or repository query over prose.
5. **Probe the highest-risk paths.** Prioritize consumers outside the changed package, migration edges, retries, partial failure, and old data.
6. **Classify findings.** Distinguish proven risk, unproven concern, and cleared path.

If the search is broad, fan out read-only scouts by subsystem. Give each scout a disjoint question and synthesize only evidence-backed findings.

## Output

- What changed.
- The one safety premise and its proof status.
- Risks with `file:line`, failure mechanism, likelihood/impact, and check.
- Cleared areas and evidence.
- The cheapest pre-merge test that catches the real failure.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
