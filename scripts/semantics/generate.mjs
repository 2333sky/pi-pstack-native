import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_RESOURCES } from '../../src/compatibility/adapter.ts';
export function renderCore(root, resource) {
  const metadata=JSON.parse(readFileSync(join(root,'SEMANTICS.json'),'utf8')).snapshot;
  const original=readFileSync(join(root,metadata.root,'pstack/skills',resource),'utf8');
  const adapter=readFileSync(join(root,'docs/PI-SEMANTIC-ADAPTER.md'),'utf8');
  const skill=resource.endsWith('/SKILL.md');
  const front=skill ? original.match(/^---\n[\s\S]*?\n---\n/)[0] : '';
  const body=original.slice(front.length);
  const piFront=front.replace(/^name:.*$/m,`name: ${resource.split('/')[0]}`);
  const questions = resource === 'automate-me/SKILL.md' ? '\n## Pi question interaction\n\nCursor `AskQuestion` is not a Pi tool supplied by this package. Ask in chat using clearly described options and let the user reply in their own words. For multiple selections, explicitly invite any combination; do not claim a multi-select UI was shown. Preserve the user’s answers before proceeding.\n' : resource === 'poteto-help/SKILL.md' ? '\n## Pi question and setup interaction\n\nAsk clarification questions in chat with clearly described options and accept a free-form answer; do not assume Cursor `AskQuestion` is available. Direct users to Pi’s `/setup-pstack` for reasoning budgets, role models and model panels. It maps the budget to Pi reasoning levels rather than rewriting Cursor model slugs. The command suggests optional verification Skills; model support varies.\n' : resource === 'setup-pstack/SKILL.md' ? '\n## Pi setup interaction\n\nUse the native `/setup-pstack` command. Review its suggested role models, task overrides and panels, and edit only choices that need changing. Existing settings are preserved. Panel seats may repeat or inherit the parent; repeated models do not provide model diversity. Budget presets set Pi thinkingLevel rather than rewriting Cursor model slugs. The command mentions optional verification Skills; do not claim they ran unless invoked.\n' : '';
  const panelNames = { 'arena/SKILL.md': 'arena', 'architect/SKILL.md': 'architect', 'interrogate/SKILL.md': 'interrogate' };
  const panelName = panelNames[resource];
  const panelGuide = panelName ? '\n## Pi panel execution\n\nUse `/setup-pstack` to review or change the ' + panelName + ' panel. Unconfigured panels use disclosed session-available suggestions. Use `pstack_semantics` with action `panel` and name `' + panelName + '` to resolve the configured seats against the model registry; this does not check authentication or run inference. Then use `pstack_workflow` with template.kind `' + panelName + '`; it loads those seats automatically. Create the strict brief and, for arena/architect, a rubric. Plan first and inspect the resulting models. A plan or preflight does not mean execution ran. Arena/architect use one read-only cross-judge when an eligible different-family model is available. When skipped, inspect and select candidates yourself. Interrogate uses isolated adversaries and separate repro sessions; inspect their real command evidence.\n' : '';
  const engineeringOverlay = resource === 'poteto-mode/SKILL.md' ? `
## Pi engineering checkpoints for code-changing tasks

The coordinator applies these checkpoints within the selected pstack playbook; they are not extra agents, DAG nodes, or mandatory external tools. Pass applicable checkpoints and evidence requirements into each writing subagent's task brief.

1. **First make it work.** Define observable success and the data shape. For a bug, reproduce the failure and, when practical, run a test that fails for the expected reason before editing. If that is impractical, explain why and use the closest useful executable check. Make the smallest evidence-backed change and verify its behavior.
2. **Then make it right.** Fix the root cause; subtract needless branches and abstractions before adding new ones. Check domain types, boundaries, and shared state. Preserve proven behavior through refactoring and rerun relevant checks. Use authorized complexity, duplication, or mutation tools when available and justified; do not assume they exist or silently install them.
3. **Practice.** Work in small verifiable units. Record significant decisions, commands, and evidence references. Clean only owned, safe worktrees. Respect existing authorization for commits and remote operations.

**Failed premise:** If two fixes sharing an assumption fail the same gate, write down and test that assumption before trying a third fix based on it.

**Completion:** Verify the integrated artifact after parallel writers converge. Distinguish behavioral evidence, design review, and agent reports; disclose skipped, blocked, or inconclusive checks. The existing task contract, verification policy, fingerprints, and evidence ledger remain authoritative; this guidance does not itself make a gate pass.

Skip these code-change checkpoints for read-only investigations or prose-only tasks.
` : '';
  const prelude=`\n<!-- Generated by scripts/semantics/generate.mjs; edit the source mapping/adapter, not this file. -->\n\n${adapter}\n${questions}${panelGuide}${engineeringOverlay}\n---\n\n## Pinned upstream instructions\n\nSource: cursor/plugins@${metadata.commit}, pstack/skills/${resource}. The following body is retained verbatim.\n\n`;
  const runtime='\n\n## Pi execution tools\n\nUse `pstack_agents` for one child and `pstack_workflow` / `pstack_graph` for an explicit DAG. Roles are `architect`, `worker`, `reviewer`, `verifier`, `synthesizer` and `integrator`. Parallel writers use isolated worktrees, then an integrator. A verifier directly depends on the artifact owner. Inspect workflow status on recovery; completed nodes are not replayed. Check remote state before retrying external effects. `pstack_worktrees` cleans only owned clean worktrees.\n';
  // A wrapper heading makes upstream numbered steps available to the existing contract extractor.
  return piFront+prelude+(skill?'':'## Steps\n\n')+body+runtime;
}
export function generatedResources(root) {
  const registry=JSON.parse(readFileSync(join(root,'PARITY.json'),'utf8'));
  return [...Object.entries(registry.skills).filter(([,status])=>status==='ADAPTED').map(([name])=>`${name}/SKILL.md`),...Object.entries(registry.playbooks).filter(([,status])=>status==='ADAPTED').map(([name])=>`poteto-mode/playbooks/${name}.md`)].sort();
}
export function generateCore(root, write=false) {
  for(const resource of generatedResources(root)) {
    const file=join(root,'skills',resource),expected=renderCore(root,resource);
    if(write)writeFileSync(file,expected);
    else if(readFileSync(file,'utf8')!==expected)throw new Error(`SEMANTIC_ENTRYPOINT_DRIFT: ${resource}; regenerate after review`);
  }
}
if(process.argv[1]?.endsWith('/semantics/generate.mjs'))generateCore(process.cwd(),process.argv.includes('--write'));
