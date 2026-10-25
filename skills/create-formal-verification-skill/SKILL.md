---
name: create-formal-verification-skill
description: "Generate a project-local skill that formally verifies the code where a bug costs the most and tests reach the least, in any language, with whichever verification tool fits. Use for /skill:create-formal-verification-skill, \"model-check this race\", \"prove this invariant\", or when concurrency, retries, state machines, parsers, or unsafe code need more than tests."
disable-model-invocation: true
---

# Create a formal verification skill

A test checks the cases that someone thought to write. Formal verification checks every case in a stated scope. That scope can be every order of steps in a model, every input up to a bound, or every input. This skill finds the part of the repo where that matters most and verifies one property of it. It leaves a project-local skill that lets the next agent check a change against that property. Write that skill for an agent who reads it cold, mid-change, and has never seen your work. The user must be able to trust the result and act on it without learning the verification language.

## Choose the target from the code

Answer from the codebase, and ask the user only what you cannot observe. If the user named an area or a bug, start there.

A good target is a promise the code makes, where a break harms users and tests rarely reach the case that breaks it. Choose the strongest such target in the repo, not the one that is easiest to verify.

## Let the question choose the tool

Pick the tool that answers the question at the lowest cost. Use a model checker, a proof assistant, an SMT-backed verifier, or another tool. Whether events can happen in a bad order usually suits a model checker over a small model of the design. TLA+ is the default for that in any language.

Whether the code itself behaves for every input usually suits a verifier that runs on the code. Examples include memory safety, overflow, or a data-structure invariant. If no verifier runs on this language, say so. Test the real code with generated inputs, not a hand model of the function. A property that must hold at every size, where a bound is not enough, can need a proof. Prefer a tool that the repo's developers can install and run. Tell the user why you chose it.

This package does not ship a formal verifier or a verified tool installation path. Inspect the target repo's documented commands and installed tools before writing a check. Run the chosen tool's documented version or help command and a small real check. Record the exact commands and tool version. A tool on PATH alone does not prove it runs.

For TLC, first run `java -version`. Use the repo's documented TLC command if it has one. Otherwise, locate the real installed `tla2tools.jar`. For the install check, set `TLA2TOOLS_JAR` to that file's actual path and run `test -f "$TLA2TOOLS_JAR" && java -cp "$TLA2TOOLS_JAR" tlc2.TLC -help`. This variable is an input to the check, not a path supplied by this package. Do not guess the JAR path or claim that Java alone supplies TLC.

If the required runtime or verifier is missing or its check fails, verification is blocked. Report the failed check, the tool that needs installation or repair, and the exact check the user can rerun. Do not invent a repository script or substitute tests and call them formal verification. Any generated skill remains a draft until its checks run. The generated-input fallback above applies when no verifier supports the language, not when a chosen verifier is merely missing.

## What makes it good

- **True to the code.** Every part of the model or proof points to code that a reviewer can open. What the verification treats as one indivisible step is one indivisible step in the code. Names come from this repo.
- **Able to fail.** A check that you have never seen fail proves nothing. Show each property failing on a broken variant of the code it guards, such as a removed check or a reordered step.
- **Findings stay findings.** When the current code breaks the property, report it with the counterexample in the code's terms. Do not weaken the property or the model until it passes. Do not change product code unless the user asks.
- **Honest about scope.** Say what is verified, under which bounds and assumptions, and what is left out. A pass covers the model or the bound, not the whole system.
- **Readable without the tool.** State the property and the harm in one plain sentence each. Tell a counterexample as a short sequence of steps in the code's words.
- **Cheap to rerun.** One command, a reproducible tool version, and a run short enough that the next agent will use it on every relevant change.
- **Kept in step with the code.** Record which files and functions each check covers. Record the commit at which you last confirmed that the verification describes them. When the covered code changes after that commit, the next agent can see that the verification needs another look.

## Generate the verify skill

Write a project-local skill with frontmatter that names the area and says when to use it. Without frontmatter, the skill never registers. Use the target repo's Pi skill location and Agent Skills frontmatter format. From the skill alone, the next agent must be able to tell whether a change touches the verified code and run the check. It must explain how to tell a real bug from a modeling error and update the verification when a change is intended.

Put the coverage record and the sync commit in the skill. Tell the next agent to move the sync commit forward only after it confirms that the verification describes the code at the new commit. Use this repo's real commands, paths, and nouns. Leave no placeholders.

If the check is a TLA+ model, tell the next agent to read every result with the pstack `/skill:statechart` skill. It shows each invariant violation the checker finds as its shortest path in plain words. It also shows which of those violations a change fixes. When the check passes, `/skill:statechart` draws a chart of how the system moves between states. Refer to `/skill:statechart` by name. Its commands, options, and file paths change between releases and machines. Copy none of them into the generated skill or its scripts. If that skill is not installed, report the missing dependency. Do not claim that the required result review is complete.

## Prove it before you hand off

Follow the generated skill once, as the next agent would, on a scratch change that breaks the property in the real code. It must catch the break. Then drop the scratch change and confirm that the check is back where it started. It must pass or fail only on the findings you will report. A verify skill that was never run is a draft. If the skill misses the break or a step does not run, fix the skill or the verification, not the scratch change.

## Hand off

Tell the user what you verified, which tool you used and why, the bounds, what the check found in plain words, how to run it, and what it does not cover. Suggest a second target only if you found a close one. Point the user at `/skill:maintain-formal-verification-skill` for bringing the verification back in line after changes that did not recheck it. If that skill is not installed, state that limit rather than claim it is available.
