---
name: interrogate
description: "Run independent read-only reviewers against a diff or design, synthesize disagreement, and make a lead judgment on actionable findings."
disable-model-invocation: true
---
# Interrogate

Use this for adversarial or multi-model review, blind-spot hunting, or when a design/diff is important enough that one reviewer is not sufficient.

## Step 1: Determine scope

Resolve the exact diff, files, design, or commit range. Read the intent and acceptance criteria before asking reviewers to judge implementation.

## Step 2: State intent

Write a compact intent brief: what the change is meant to do, what it must not do, and what evidence already exists. Reviewers get the same brief.

## Step 3: Spawn reviewers

Run 2-4 read-only reviewers in parallel. Give each an angle, for example:

- correctness and edge cases;
- security/data boundaries;
- maintainability/abstraction quality;
- compatibility/blast radius;
- tests and verification gaps.

Reviewers cite concrete code/evidence. “I dislike this pattern” without a failure mechanism is not a finding.

## Step 4: Synthesize

Deduplicate findings. Preserve disagreement. For each issue, check the cited source yourself before accepting it.

## Step 5: Lead judgment

Classify:

- **Act on** — real correctness/security/maintainability issue that should block.
- **Consider** — valid trade-off worth operator attention.
- **Noted** — true but not actionable now.
- **Dismissed** — wrong, nitpicky, or missing context.

If reviewers agree for the wrong reason, the agreement does not upgrade the finding.

## Output

Include intent, reviewer summaries, lead judgment categories, and an agreement map. For accepted issues, name the concrete fix or proof needed.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
