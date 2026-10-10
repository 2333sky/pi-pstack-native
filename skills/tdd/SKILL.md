---
name: tdd
description: "Use failing-test-first only when requested or when a bug has a cheap local regression-test target; otherwise do not force an expensive test shape."
disable-model-invocation: true
---
# TDD Bug Fix

Use this when the operator explicitly asks for TDD/failing test/regression test, or a bug has an obvious cheap local test target.

## Workflow

1. Reproduce the bug on the real surface when practical.
2. Identify the narrow public behavior a test can observe.
3. Write one regression test that fails for the right reason. Run it and capture the failure.
4. Make the smallest root-cause fix.
5. Run the new test and surrounding suite.
6. Re-run the original real-surface repro. Unit green is not proof the user bug is gone.
7. Keep the test only if it protects behavior rather than internal call structure.

When commit history matters, place the failing regression test before the fix so the causal sequence is reviewable.

## If a failing test is impractical

Say why: unclear target, integration-only behavior, very expensive harness, nondeterministic external dependency, or no stable observable boundary. Do not create a fake unit test that only asserts mocks. Reproduce and verify using the real surface instead.

## Guardrails

Reject weak assertions such as “defined”, “did not throw”, or only “mock called” when a literal user-observable result is available. Follow `principle-test-behavior-not-implementation`.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
