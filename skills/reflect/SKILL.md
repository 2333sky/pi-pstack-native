---
name: reflect
description: "Review a finished task from several angles and turn durable lessons into concrete edits to skills, checks, architecture, or agent instructions."
disable-model-invocation: true
---
# Reflect

Use after a meaningful task when the operator asks to reflect or when the same friction is likely to recur.

## Process

1. Locate the active task evidence: current Pi session, diff/commits, workflow journal, verification output, and operator corrections.
2. Spawn three read-only reviewers in parallel with different questions:
   - **judgment:** which decisions were strong or weak and why;
   - **tooling:** what repeated manual work should become a script/check/harness;
   - **divergence:** where the run drifted from its stated playbook, principle, or acceptance criteria.
3. Synthesize only lessons supported by concrete evidence.
4. For each lesson, choose the highest durable enforcement layer: architecture/types → lint/check → behavior test → skill/instruction.
5. Propose or apply focused edits to existing skills/checks. Do not create a new rule for every one-off inconvenience.
6. Verify changed skill links/frontmatter and any executable check.

## Output

List:

- lesson and evidence;
- durable change made/proposed;
- why that layer is appropriate;
- what not to encode because it was one-off;
- verification of the updated mechanism.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
