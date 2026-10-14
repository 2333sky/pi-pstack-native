---
name: create-verification-skill
description: "Create a project-local verification skill that drives the real user-facing surface and produces repeatable pass/fail evidence."
disable-model-invocation: true
---
# Create Verification Skill

Use this when a repository lacks a reliable agent-operable way to prove behavior on the real product surface.

## 1. Interview the repository, not the user

Discover:

- the primary user surface: web, CLI/TUI, desktop, API, mobile, library, or several;
- the documented dev/start command and readiness signal;
- available harnesses: Playwright/Cypress, PTY/tmux, HTTP scripts, debug ports, fixtures;
- observable evidence: screenshots, terminal transcripts, response bodies, logs, exit codes, stored state;
- isolation controls: ports, profiles, data dirs, temp DBs, worktrees;
- authentication or seed-data requirements.

Prefer existing project machinery over inventing a new framework.

## 2. Generate the skill

The project-local skill must define:

- **launch**: exact start/build command and readiness check. From an empty data directory, run required migrations and seed data and reach a usable user surface. A healthy port/database alone is not readiness;
- **doctor**: read-only check that confirms the target instance is the expected build and safe to drive;
- **drive**: concrete commands/actions for each important feature;
- **observe**: what evidence proves success;
- **teardown**: how owned processes/data are cleaned safely;
- **isolation**: how concurrent agents avoid the same instance/state;
- **failure semantics**: “inconclusive” is not “pass”.

Keep commands rerunnable and bounded. Never hijack a user's unrelated running instance.

## 3. Seed a feature map

List major user-facing features with the source owner, drive recipe, and observable result. For each feature, include Sub-features, How to get to it (user POV), Driving it with the harness, and Gotchas. If seed data lacks a journey precondition, report failure and record the reason in Gotchas; never weaken the journey to obtain a pass.

## 4. Prove the skill

Launch a clean instance and drive at least one representative success path plus one failure or edge path. Confirm evidence survives teardown, and clean owned processes after failed attempts too. When a container/local stack stands in for a VM/remote target, list every setup step the stand-in performed that the real target has not yet exercised. Those steps remain unverified. A skill that has not driven the product is not done.

## 5. Hand back

Report the skill path, supported surfaces, exact verification command, known gaps, and whether a maintenance pass is recommended.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
