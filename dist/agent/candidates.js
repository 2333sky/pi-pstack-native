import { changedPaths } from "../contracts/brief.js";
import { fingerprint } from "../artifacts/fingerprint.js";
import { lstatSync, realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { worktreeRoot } from "../runtime/home.js";
import { protocol } from "../runtime/protocol.js";
import { ledgerCurrent } from "../verification/runner.js";
import { createReadOnlyTools } from "./read-only-tools.js";
export function assertCandidateCurrent(input) {
    const root = realpathSync(worktreeRoot()), workspace = realpathSync(input.workspace);
    if (lstatSync(input.workspace).isSymbolicLink() || !workspace.startsWith(`${root}${sep}`))
        throw new Error(`CANDIDATE_WORKSPACE_OUTSIDE_WORKTREES: ${input.key}`);
    const state = protocol(), ledger = state.ledgers[input.ledgerId], artifact = state.artifacts[input.artifactId];
    if (!ledger || ledger.artifactId !== input.artifactId || !artifact || artifact.cwd !== workspace || !ledgerCurrent(ledger, fingerprint(workspace))) {
        throw new Error(`CANDIDATE_ARTIFACT_CHANGED: ${input.key}`);
    }
}
/** Read only the named candidate worktrees, using the same path confinement as ordinary reviewers. */
export function createCandidateTool(inputs) {
    const candidates = new Map(inputs.map(input => [input.key, input]));
    const tools = new Map(inputs.map(input => [input.key, createReadOnlyTools(input.workspace)]));
    return {
        name: 'pstack_candidates', label: 'Candidate artifacts',
        description: 'List verified candidate labels and inspect files in one named candidate. Paths are confined to that candidate worktree; there are no write or shell actions.',
        parameters: { type: 'object', properties: {
                action: { type: 'string', enum: ['list', 'read', 'ls', 'find', 'grep'] },
                candidate: { type: 'string' }, path: { type: 'string' }, query: { type: 'string' },
                pattern: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' }, maxResults: { type: 'number' },
            }, required: ['action'], additionalProperties: false },
        annotations: { readOnlyHint: true, idempotentHint: true },
        async execute(id, args) {
            if (args.action === 'list') {
                const views = inputs.map(input => {
                    assertCandidateCurrent(input);
                    const paths = changedPaths(input.baseline, fingerprint(input.workspace), input.workspace);
                    return { candidate: input.key, changedPaths: paths.slice(0, 300), truncated: paths.length > 300 };
                });
                return { content: [{ type: 'text', text: JSON.stringify(views, null, 2) }], details: views };
            }
            const input = candidates.get(args.candidate);
            if (!input)
                throw new Error('UNKNOWN_CANDIDATE');
            assertCandidateCurrent(input);
            const tool = tools.get(input.key).find(t => t.name === args.action);
            if (!tool)
                throw new Error('INVALID_CANDIDATE_ACTION');
            return await tool.execute(id, args);
        },
    };
}
