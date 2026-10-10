---
name: figure-it-out
description: "Design and execute an auditable workflow when no narrower playbook fits, with explicit finish conditions, hypothesis loops, and durable evidence."
disable-model-invocation: true
---
# Figure It Out

Use this for a large migration, ambiguous multi-part engineering task, or work that will be reviewed after the operator steps away and no narrower playbook fits.

## Phase A: Frame

- State the outcome and a checkable done predicate.
- Name hard constraints, non-goals, and irreversible actions.
- Identify the highest uncertainties rather than pretending the whole plan is known.
- Set a bounded scope for the first run.

## Phase B: Design the workflow

Break the work into verifiable units. Decide which units are independent, which require a predecessor, and which need a separate verifier. Use a DAG rather than an informal list when dependencies matter. Define what evidence each node must return.

Before scaling, run a small pilot through implementation and verification. Let the pilot falsify the brief, unit size, and verification recipe.

## Phase C: Run a hypothesis loop

For each uncertainty:

1. state the hypothesis;
2. choose the cheapest discriminating experiment;
3. run it;
4. keep/revise/reject the hypothesis;
5. update the next unit.

Do not accumulate speculative fixes. Revert work that does not advance the done predicate.

## Phase D: Keep an audit trail

Use `/skill:show-me-your-work` for long or unattended runs. Log decisions, reasons, evidence, and outcomes. Keep bulky raw output in child sessions or artifacts, not the parent context.

## Phase E: Verify and hand back

Run the real acceptance checks, inspect the final diff/state, and state what remains uncertain. If a genuine blocker requires product direction or an irreversible action, surface that exact decision.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
