---
name: maintain-verification-skill
description: "Audit an existing project verification skill and feature map against current source and a live product session, shipping only proven corrections."
disable-model-invocation: true
---
# Maintain Verification Skill

Use this periodically to keep a project's verification skill honest as the product changes.

## Scope

The output is one of:

- **clean** — every sampled feature had source and live coverage; no correction needed;
- **changed** — proven corrections were made and verified;
- **blocked** — coverage could not finish safely; state the exact blocker.

## Pass

1. Locate the verification skill and its feature map.
2. Enumerate current user-facing features from source/routes/commands/schema, not from the map alone.
3. Fan out read-only scouts by feature group to compare source ownership with the documented drive recipe.
4. Start one controlled live instance using the skill itself.
5. Drive every high-value feature and a representative sample of the rest. Capture concrete evidence.
6. For each mismatch, decide whether source, harness, or documentation is wrong.
7. Make only corrections proven by source plus live behavior. Keep the change bounded to the verification skill/harness/map unless a product bug is separately requested.
8. Re-run the corrected recipes from a clean state.

Do not “improve” recipes based on taste. A maintenance pass is about drift proven today.

## Output

Return the outcome, features covered, corrections with evidence, gaps, and the exact command that proves the maintained skill works.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
