# Authoring or modifying a skill

**Goal:** Create or revise one Agent Skill with precise triggers, operational instructions, native Pi semantics, and evidence that the skill can be followed.

## Steps

1. Define the behavior the skill changes and the user phrases/situations that should trigger it. If an existing skill already owns the behavior, edit that skill instead of creating a near-duplicate.
2. Read adjacent skills and repository conventions. Decide which rules belong inline and which large/rare references belong in subfiles.
3. Write frontmatter with a stable `name` and a concrete `description`. Use `disable-model-invocation: true` for explicit-only skills; omit it only when automatic discovery is intentional.
4. Write imperative instructions around decisions, steps, evidence, and failure handling. Replace Cursor-only mechanics with `pstack_agents`, `pstack_workflow`, worktrees, Pi sessions, or an explicit unsupported note.
5. Validate referenced files/commands/skills and frontmatter. For structural skills, build a small test or fixture that proves the critical route. For subjective writing/style skills, use representative examples instead of fake unit tests.
6. Run `/skill:unslop` and a skeptical review. If shipping the skill in a repo, follow Opening a PR.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
