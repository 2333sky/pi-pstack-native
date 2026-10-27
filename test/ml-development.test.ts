import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkillsFromDir } from '@earendil-works/pi-coding-agent';
import { createResourceTools } from '../src/agent/resources.ts';

const root = fileURLToPath(new URL('../skills/', import.meta.url));
const resources = [
  'ml-development/SKILL.md',
  ...['01-scope', '02-data', '03-baseline', '04-experiments', '05-evaluation', '06-reproducibility'].map(name => `ml-development/playbooks/${name}.md`),
  'ml-development/references/run-record.md',
  'ml-development/references/experiment-matrix.md',
];

test('Pi discovers the ML skill and child agents can read all its referenced resources', async () => {
  const loaded = loadSkillsFromDir({ dir: root, source: 'path' });
  assert.deepEqual(loaded.diagnostics, []);
  assert.equal(loaded.skills.filter(skill => skill.name === 'ml-development').length, 1);
  const tool = createResourceTools(root)[0];
  const listed = await tool.execute('test', { action: 'list' });
  assert.ok(listed.details.resources.includes(resources[0]));
  for (const resource of resources) {
    let offset = 1;
    let pages = 0;
    const lines: string[] = [];
    while (true) {
      const result = await tool.execute('test', { action: 'read', resource, offset, limit: 7 });
      pages++;
      lines.push(...result.details.lines.map((line: { text: string }) => line.text));
      if (!result.details.hasMore) break;
      offset = result.details.nextOffset;
    }
    assert.ok(pages > 1, `${resource} exercised pagination`);
    assert.equal(lines.join('\n'), readFileSync(join(root, ...resource.split('/')), 'utf8').replace(/\r\n/g, '\n'), resource);
  }
  await assert.rejects(tool.execute('test', { action: 'read', resource: 'ml-development/../../package.json' }), /INVALID_SKILL_RESOURCE/);
});

// These check the declared policy and resource contract, not untested LLM compliance.
test('ML skill stays opt-in and delegates to existing read-only and writable roles', () => {
  const skill = readFileSync(join(root, 'ml-development/SKILL.md'), 'utf8');
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /Start explicitly with `\/skill:ml-development/);
  assert.match(skill, /Reuse existing `scout` and `architect`/);
  assert.match(skill, /Read-only roles cannot run training or shell verification/);
  assert.match(skill, /not one agent per stage/);
});

test('ML playbooks retain missing-data, leakage, synthetic-result and resource gates', () => {
  const cases: [string, string, RegExp][] = [
    ['no usable data is not a completed experiment', 'SKILL.md', /blocked or inconclusive/],
    ['a child model budget does not bound training processes', 'SKILL.md', /not GPU-hour limits or operating-system supervision/],
    ['group or time leakage must be checked', 'playbooks/02-data.md', /Verify no group, duplicate or future information crosses/],
    ['test set must not be used for tuning', 'playbooks/02-data.md', /If the test set has already influenced decisions/],
    ['synthetic smoke is not real-world model validation', 'playbooks/03-baseline.md', /A fake or synthetic check is not a real-data result/],
    ['unbounded training must not be launched', 'playbooks/04-experiments.md', /require an execution surface authorized to enforce limits/],
    ['dirty code must have a recoverable record', 'references/run-record.md', /recoverable patch or source snapshot/],
    ['artifact path alone is not evidence of reproducibility', 'references/run-record.md', /content digests if available/],
  ];
  for (const [name, path, required] of cases) {
    assert.match(readFileSync(join(root, 'ml-development', path), 'utf8'), required, name);
  }
});
