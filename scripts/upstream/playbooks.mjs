import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJSON } from './core.mjs';
import { PROFILES } from '../../src/agent/profiles.ts';

const contractPath = 'docs/playbook-contracts.json';
const playbookDir = 'skills/poteto-mode/playbooks';
const evidenceStates = ['not_run', 'blocked', 'passed', 'failed', 'stale'];

/* The minimum observable behavior and refusal for each playbook, copied from
   section 7.3 of docs/PRD-PSTACK-NATIVE-NEXT.md. The table is the contract
   source; the playbook file supplies roles and tools. */
const minimum = {
  'authoring-a-skill': ['按实际运行环境生成并验证 Skill', '文件存在但无法加载或调用'],
  'autonomous-run': ['在授权范围内持续推进，保留停止条件', '把自治授权扩大为未授权外部动作'],
  'autopilot-full': ['每个 PR 有 Owner，代码变更后重新验证', '旧 Head 的审查被新代码复用'],
  'autopilot-stack': ['正确建立线性依赖和父分支，交付有序栈', '把所有子 PR 直接指向 trunk'],
  babysit: ['根据请求选择模式，读取 CI 和审查状态', '创建 PR 后未经触发就自动开始轮询'],
  'bug-fix': ['复现、缩小根因、实现、原始场景验证', '错误场景或无法判断的结果被记为修复成功'],
  eval: ['固定样本和评价规则，保留盲评与失败', '修改规则后继续使用旧分数比较'],
  feature: ['从数据结构和需求建立可运行行为', '仅凭实现者总结认定需求满足'],
  hillclimb: ['逐次记录假设、基线、测量和接受决定', '无可比测量就保留所谓优化'],
  investigation: ['从实际证据回答，保留来源状态', '未经任务授权修改仓库或远端'],
  'multi-phase-plan': ['每阶段有目标、依赖、产物和验收', '前一阶段未验收就把后续阶段标为完成'],
  'opening-a-pr': ['按目标基线确定 PR 状态、父分支和正文', '在权限或验证不足时声称已创建 PR'],
  orchestrate: ['维护长期任务、指令版本和阶段交付', '旧指令下的孤立 Workflow 自动恢复'],
  'pause-safely': ['记录在途动作、产物和恢复条件', '把暂停视为外部副作用已撤销'],
  'perf-issue': ['用相同场景建立基线并解释限制因素', '改变工作量后宣称性能提升'],
  prototype: ['用最小实验回答具体设计分歧', '把试验代码默认为生产实现'],
  refactoring: ['保留明确的外部行为并运行验证', '结构改动中混入未经授权的需求变更'],
  'runtime-forensics': ['读取运行中证据并确认触发机制', '仅凭静态推测关闭运行时问题'],
  'session-pickup': ['从当前代码、状态和历史证据恢复任务', '仅依赖旧摘要继续写入'],
  shipping: ['独立验证，按底部连续已验证区间交付并读回', 'CI 绿、排队或启用 auto-merge 被当作已合并'],
  'trace-forensics': ['分析指定采样材料，标明采集条件和局限', '在材料不支持时推断根因已确认'],
  'visual-parity': ['在固定视口和状态下对比真实图像', '用组件存在或文字总结证明视觉一致'],
  'worktree-cleanup': ['检查归属、改动和合并状态，再执行已授权清理', '强制删除未知或含未保留修改的工作区'],
};

const roleNames = Object.keys(PROFILES).sort((a, b) => b.length - a.length);
const rolePattern = new RegExp(`\\b(?:${roleNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');

function playbookFiles(root) {
  const dir = join(root, playbookDir);
  if (!existsSync(dir)) throw new Error(`PLAYBOOK_DIR_MISSING: ${playbookDir}`);
  return readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => name.slice(0, -3));
}

function stepsSection(text) {
  const start = text.search(/^##\s+Steps\s*$/m);
  if (start < 0) return '';
  const rest = text.slice(start);
  const next = rest.slice(1).search(/^##\s/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function rolesIn(text) {
  return [...new Set(text.match(rolePattern) ?? [])].sort();
}

function orderedSteps(text) {
  const steps = [];
  for (const match of text.matchAll(/^(\d+)\.\s+(.+)$/gm)) {
    const step = match[2].replace(/`([^`]*)`/g, '$1').trim();
    steps.push({ order: Number(match[1]), text: step });
  }
  return steps.sort((a, b) => a.order - b.order);
}

export function buildContracts({ root }) {
  const names = playbookFiles(root);
  const unknown = names.filter((name) => !Object.hasOwn(minimum, name));
  if (unknown.length) throw new Error(`PLAYBOOK_CONTRACT_MISSING: ${unknown.join(', ')}`);
  const extra = Object.keys(minimum).filter((name) => !names.includes(name));
  if (extra.length) throw new Error(`PLAYBOOK_CONTRACT_ORPHAN: ${extra.join(', ')}`);
  const parent = readFileSync(join(root, 'skills/poteto-mode/SKILL.md'), 'utf8');
  const manualOnly = /^disable-model-invocation:\s*true$/m.test(parent);
  const contracts = names.map((name) => {
    const text = readFileSync(join(root, playbookDir, `${name}.md`), 'utf8');
    const steps = stepsSection(text);
    const roles = rolesIn(steps);
    const tools = [...new Set(roles.flatMap((role) => PROFILES[role]?.tools ?? []))].sort();
    const [observe, mustReject] = minimum[name];
    return {
      name,
      source: `${playbookDir}/${name}.md`,
      trigger: `the operator asks for a task that matches ${name}, or names it explicitly`,
      manualOnly,
      roles,
      parentOnly: roles.length === 0,
      tools,
      requiredSteps: orderedSteps(steps),
      observe: [observe],
      mustReject: [mustReject],
      evidence: { status: 'not_run', refs: [] },
    };
  });
  return {
    schemaVersion: 1,
    source: { plan: 'docs/PRD-PSTACK-NATIVE-NEXT.md section 7.3', profiles: 'src/agent/profiles.ts' },
    contracts,
  };
}

export function validateContracts(document, { root }) {
  const fail = (message) => { throw new Error(`CONTRACT_${message}`); };
  if (document?.schemaVersion !== 1) fail('SCHEMA_VERSION');
  const fresh = buildContracts({ root });
  if (!Array.isArray(document.contracts) || document.contracts.length !== fresh.contracts.length) fail('COUNT_MISMATCH');
  const names = new Set();
  for (const [index, contract] of document.contracts.entries()) {
    const expected = fresh.contracts[index];
    if (!contract || typeof contract !== 'object') fail('ENTRY_SHAPE');
    if (contract.source !== expected.source) fail(`SOURCE_MISMATCH: ${contract.source}`);
    if (names.has(contract.name)) fail(`DUPLICATE: ${contract.name}`);
    names.add(contract.name);
    if (!Array.isArray(contract.observe) || contract.observe.length === 0) fail(`OBSERVE_EMPTY: ${contract.name}`);
    if (!Array.isArray(contract.mustReject) || contract.mustReject.length === 0) fail(`REJECT_EMPTY: ${contract.name}`);
    if (!Array.isArray(contract.requiredSteps) || contract.requiredSteps.length !== expected.requiredSteps.length) fail(`STEPS_MISMATCH: ${contract.name}`);
    if (expected.requiredSteps.length === 0) fail(`STEPS_EMPTY: ${contract.name}`);
    for (const [stepIndex, step] of contract.requiredSteps.entries()) {
      if (step.order !== stepIndex + 1) fail(`STEP_ORDER: ${contract.name} ${step.order}`);
      if (typeof step.text !== 'string' || step.text.trim().length === 0) fail(`STEP_EMPTY: ${contract.name}`);
    }
    if (JSON.stringify(contract.roles) !== JSON.stringify(expected.roles)) fail(`ROLES_MISMATCH: ${contract.name}`);
    if (contract.parentOnly !== (contract.roles.length === 0)) fail(`PARENT_ONLY_MISMATCH: ${contract.name}`);
    for (const role of contract.roles) if (!Object.hasOwn(PROFILES, role)) fail(`UNKNOWN_ROLE: ${role}`);
    if (JSON.stringify(contract.tools) !== JSON.stringify(expected.tools)) fail(`TOOLS_MISMATCH: ${contract.name}`);
    if (contract.manualOnly !== expected.manualOnly) fail(`MANUAL_ONLY_MISMATCH: ${contract.name}`);
    if (!evidenceStates.includes(contract.evidence?.status)) fail(`EVIDENCE_STATE: ${contract.name}`);
    if (!Array.isArray(contract.evidence.refs)) fail(`EVIDENCE_REFS: ${contract.name}`);
    if (contract.evidence.status === 'passed' && contract.evidence.refs.length === 0) fail(`EVIDENCE_UNSUPPORTED: ${contract.name}`);
    if (contract.evidence.status === 'not_run' && contract.evidence.refs.length > 0) fail(`EVIDENCE_STALE_REF: ${contract.name}`);
  }
  for (const name of fresh.contracts.map((contract) => contract.name)) if (!names.has(name)) fail(`MISSING: ${name}`);
  return document;
}

export function readContracts(root) {
  return validateContracts(readJSON(join(root, contractPath)), { root });
}

export { contractPath };
