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
    const lines: string[] = [];
    while (true) {
      const result = await tool.execute('test', { action: 'read', resource, offset });
      lines.push(...result.details.lines.map((line: { text: string }) => line.text));
      if (!result.details.hasMore) break;
      offset = result.details.nextOffset;
    }
    assert.equal(lines.join('\n'), readFileSync(join(root, ...resource.split('/')), 'utf8').replace(/\r\n/g, '\n'), resource);
  }
});
