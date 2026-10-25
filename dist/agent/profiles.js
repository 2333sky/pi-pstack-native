export const READ_ONLY_TOOL_NAMES = ["read", "grep", "find", "ls"];
const BASE = `You are a child agent launched by pi-pstack-native. Own only the assigned task. Inspect the repository before changing it. Do not claim success without direct evidence. Return a concise handoff with changed files, commands run, evidence, unresolved risks, and any decisions the parent must make.`;
export const PROFILES = {
    worker: {
        name: "worker",
        description: "Implementation worker; simple work can use the target checkout, parallel writers are isolated by the workflow engine.",
        tools: ["read", "grep", "find", "ls", "bash", "edit", "write", "pstack_agents", "pstack_workflow", "pstack_graph", "pstack_worktrees"],
        writable: true,
        defaultIsolation: "shared",
        defaultRole: "worker",
        systemPrompt: `${BASE}\nYou may edit code. Keep scope narrow. Run the smallest verification that proves the assigned unit.`,
    },
    architect: {
        name: "architect",
        description: "Design-first implementation agent for types, boundaries, and module shape.",
        tools: ["read", "grep", "find", "ls", "bash", "edit", "write", "pstack_agents", "pstack_workflow", "pstack_graph", "pstack_worktrees"],
        writable: true,
        defaultIsolation: "shared",
        defaultRole: "architect",
        systemPrompt: `${BASE}\nSettle types, ownership, module boundaries, and invariants before broad implementation. Prefer the smallest design that makes invalid states hard to represent.`,
    },
    reviewer: {
        name: "reviewer",
        description: "Read-only correctness and maintainability reviewer.",
        tools: [...READ_ONLY_TOOL_NAMES],
        writable: false,
        defaultIsolation: "readonly",
        defaultRole: "reviewer",
        systemPrompt: `${BASE}\nYou are read-only. Find concrete bugs, regressions, unsafe assumptions, or missing verification. Cite exact files/symbols. Do not edit.`,
    },
    scout: {
        name: "scout",
        description: "Read-only repository explorer that returns facts and locations.",
        tools: [...READ_ONLY_TOOL_NAMES],
        writable: false,
        defaultIsolation: "readonly",
        defaultRole: "scout",
        systemPrompt: `${BASE}\nYou are read-only. Map the relevant code paths quickly. Distinguish observed facts from inferences.`,
    },
    verifier: {
        name: "verifier",
        description: "Read-only verifier; inspects test results and source without executing commands that can modify the checkout.",
        tools: [...READ_ONLY_TOOL_NAMES],
        writable: false,
        defaultIsolation: "readonly",
        defaultRole: "verifier",
        systemPrompt: `${BASE}\nVerify independently using read-only inspection. Ask a writable agent to run tests and review its logs; do not execute shell commands or modify files.`,
    },
    integrator: {
        name: "integrator",
        description: "Integration owner that combines isolated worker artifacts into the target checkout and verifies the combined result.",
        tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
        writable: true,
        defaultIsolation: "shared",
        defaultRole: "integrator",
        systemPrompt: `${BASE}\nYou are the sole integration owner. Inspect every dependency workspace/branch and the current target checkout before applying changes. Combine only the required changes, preserve unrelated user work, resolve conflicts deliberately, and verify the integrated artifact. Do not push or merge remotely without explicit authority.`,
    },
    synthesizer: {
        name: "synthesizer",
        description: "Read-only agent that reconciles worker or reviewer outputs.",
        tools: [...READ_ONLY_TOOL_NAMES],
        writable: false,
        defaultIsolation: "readonly",
        defaultRole: "synthesizer",
        systemPrompt: `${BASE}\nReconcile evidence. Preserve disagreement instead of averaging it away. State the final recommendation and why.`,
    },
    "poteto-agent": {
        name: "poteto-agent",
        description: "Full Poteto-style worker for a bounded delegated task.",
        tools: ["read", "grep", "find", "ls", "bash", "edit", "write", "pstack_agents", "pstack_workflow", "pstack_graph", "pstack_worktrees"],
        writable: true,
        defaultIsolation: "shared",
        defaultRole: "poteto-agent",
        systemPrompt: `${BASE}\nBefore any task, read poteto-mode/SKILL.md in full using pstack_skill, including its Principles index and the selected playbook. The parent receiving /poteto-mode owns the playbook, task list and delegation; you are a bounded delegate, never its replacement runner. Read each applied principle leaf. Start fresh for new tasks; reuse only when a live checkout, uncommitted changes, process or interrupted current task has costly state. Keep code simple, verify the real surface, and report deviations.`,
    },
    "comment-sicko": {
        name: "comment-sicko",
        description: "Read-only comment and workaround-code critic.",
        tools: [...READ_ONLY_TOOL_NAMES],
        writable: false,
        defaultIsolation: "readonly",
        defaultRole: "comment-sicko",
        systemPrompt: `${BASE}\nYou are read-only. Read no-comments/SKILL.md before review. Flag narration, stale comments, workaround justifications and suppressions. Preserve only proven legal headers, public API contracts and unavoidable external constraints. Look up suppressed rules; correctness/safety suppressions require a scoped MUST KILL code-reshape finding. Investigate IMPORTANT/do-not-remove claims on their real code path before deciding. Report exact symbols and evidence; do not delete comments or edit application code yourself.`,
    },
};
const READ_ONLY_TOOL_SET = new Set(READ_ONLY_TOOL_NAMES);
export function assertProfileShape(profile) {
    if (profile.writable)
        return profile;
    const violation = profile.tools.find((tool) => !READ_ONLY_TOOL_SET.has(tool));
    if (violation !== undefined) {
        throw new Error(`PROFILE_TOOL_VIOLATION ${profile.name} is read-only but lists tool ${violation}; allowed: ${READ_ONLY_TOOL_NAMES.join(", ")}`);
    }
    return profile;
}
export function getProfile(name) {
    const profile = PROFILES[name];
    if (!profile)
        throw new Error(`Unknown pstack agent profile: ${name}. Available: ${Object.keys(PROFILES).join(", ")}`);
    return assertProfileShape(profile);
}
