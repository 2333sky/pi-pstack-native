---
name: bro
description: "Restate the previous answer in plain human language with less jargon."
disable-model-invocation: true
---
# Bro

Restate the previous answer in plain human language with less jargon.

## Pi-native runtime

This port uses `pstack_agents`, `pstack_workflow`, and `pstack_graph` instead of Cursor `Task` or cloud-agent calls. Independent parallel writers use isolated Git worktrees; one ordinary writer may work in the target checkout, and multi-writer delivery converges through an explicit integrator. Workflow state is persisted; after restart, do not rerun nodes already marked completed. Model roles come from `~/.pi/agent/pstack-native/models.json`.
