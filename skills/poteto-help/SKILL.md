---
name: poteto-help
description: "Guide users through pi-pstack-native setup, Poteto Mode, skills, playbooks, native agents, workflows, durability, model routing, and scheduling."
disable-model-invocation: true
---
# Poteto Help

Answer a help question without starting an expensive coding workflow. Give the direct answer, at most one concrete prompt/command, and point to the relevant installed skill/playbook when useful.

## First decide what they need

Route to one of these:

- setup/model cost → `/setup-pstack`;
- start a non-trivial task → `/poteto-mode <goal + pass/fail check>`;
- pick a skill → table below;
- understand native runtime/recovery → `/pstack-runtime` and `/skill:pstack-runtime`;
- inspect compatibility → `/pstack-parity`;
- inspect active durable work → `/pstack-workflows` / `/pstack-agents`;
- inspect or clean owned worktrees → `/pstack-worktrees`;
- repeat a check while Pi is active → `/pstack-loop`;
- diagnose a bad run → read the matching playbook plus workflow/agent status.

If the question is actually “use pstack to do X”, stop being a help guide and route the work through `/skill:poteto-mode`.

## Setup

1. Install `2333` as a Pi package.
2. Run `/setup-pstack` to map roles to models. `inherit-parent` uses the current chat model.
3. Start a real task with `/poteto-mode` and include a concrete success condition.

The runtime state lives under `~/.pi/agent/pstack-native/`.

## Pick a skill

| Need | Skill |
|---|---|
| rigorous non-trivial task | `/skill:poteto-mode` |
| restate the user goal before acting | `/skill:in-your-own-words` |
| current architecture/runtime flow | `/skill:how` |
| historical rationale/decision evidence | `/skill:why` |
| plain teaching explanation | `/skill:teach` |
| design before code | `/skill:architect` |
| parallel coverage/slices | `/skill:swarm` |
| competing implementations/designs | `/skill:arena` |
| adversarial read-only review | `/skill:interrogate` |
| what a small diff could break | `/skill:blast-radius` |
| regression-test-first fix | `/skill:tdd` |
| recurring agent mistakes | `/skill:correct` |
| validate a benchmark | `/skill:benchmark-checklist` |
| create/maintain real-surface verification | `/skill:create-verification-skill`, `/skill:maintain-verification-skill` |
| remove unnecessary comments | `/skill:no-comments` |
| clean prose | `/skill:unslop`, `/skill:technical-writing` |
| catch up on this chat since your last message | `/skill:ketchup` |
| recall existing work from session history | `/skill:recall` |
| learn from a completed run | `/skill:reflect` |
| large ambiguous run | `/skill:figure-it-out` |

Principles are small decision rules usually invoked by Poteto Mode rather than directly.

## Native runtime model

`pstack_agents` creates persistent Pi child `AgentSession`s. `pstack_workflow` stores graph state and resumes unfinished children. Concurrent writers normally work in separate Git worktrees. Reviewers are read-only. This is why Cursor `Task` examples should not be copied literally.

## Chat catch-up

`/skill:ketchup` reports changes since your last user-authored message before the request. Notifications and child completions do not move that cutoff. It rechecks status without edits or remote writes. It lists only decisions or steps that need you, including older unanswered items. Chat behavior has not been exercised by the structural tests.

The verified upstream baseline is pstack `0.15.17` at `978ca6e9c0e012047cd5058b8e829240336e704e`. See `PARITY.md` for intentional Pi differences.

## Scheduling caveat

`/pstack-loop 1h <task>` stores a session-local schedule. It is **not** an OS daemon and does not wake a closed Pi process or sleeping machine. When the same session resumes, the default policy performs at most one missed catch-up run.

## Troubleshooting

- Mode stopped applying: run `/poteto-mode` again and inspect `/pstack status`.
- Child appears stuck: `/pstack-agents`, then workflow status. Do not launch duplicates until you know whether the original child is alive/recoverable.
- Model selector fails: rerun `/setup-pstack` and choose a model visible to this Pi session.
- Parallel edits collide: use workflow workers with worktree isolation; do not switch them to `shared` merely to save setup time.
- Success claim has weak evidence: route to `principle-prove-it-works` or the project verification skill.

## Help and runtime boundaries

A help question asks for an explanation and a prompt the user can send; do not start a paid Agent run. An explicit work request is different and authorizes the requested work. Read the routed Skill before advising. If no model roles are configured, explain inheritance and offer /setup-pstack once when setup/cost matters. Pi mode is sticky until turned off; Cursor Custom Mode is not required. External sources in read-only children use parent evidence packets, not implicit MCP access. See references/recipes.md for native examples.
