import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { copyReviewSnapshot } from '../src/worktree/snapshot.ts';
import { fingerprint, sameFingerprint } from '../src/artifacts/fingerprint.ts';
import { findingsBackedByVerifiers, reportSatisfies } from '../src/contracts/brief.ts';
import { planArtifacts } from '../src/workflow/artifacts.ts';

test('adversarial worktree receives staged, unstaged and untracked target changes without modifying the original', t => {
  const root = mkdtempSync(join(tmpdir(), 'pstack-review-snapshot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), worktree = join(root, 'review'); mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test');
  writeFileSync(join(repo, 'tracked.txt'), 'original\n'); git('add', '.'); git('commit', '-qm', 'initial');
  writeFileSync(join(repo, 'tracked.txt'), 'staged\n'); git('add', 'tracked.txt');
  writeFileSync(join(repo, 'tracked.txt'), 'staged and unstaged\n');
  mkdirSync(join(repo, 'new')); writeFileSync(join(repo, 'new', 'note.txt'), 'new content\n');
  git('worktree', 'add', '-q', '-b', 'review', worktree);
  const before = fingerprint(repo);
  copyReviewSnapshot(repo, worktree);
  assert(sameFingerprint(before, fingerprint(repo)));
  assert(sameFingerprint(before, fingerprint(worktree)));
  writeFileSync(join(worktree, 'tracked.txt'), 'isolated change\n');
  assert.equal(readFileSync(join(repo, 'tracked.txt'), 'utf8'), 'staged and unstaged\n');
});

test('reproduction reports require a concrete command and observed and expected output', () => {
  const brief: any = { reportRequirements: { kind: 'repro-review' } };
  const finding = { severity: 'high', location: 'file.ts:1', description: 'wrong result', evidence: 'command output', reproduction: { command: ['node', 'repro.js'], observed: 'wrong', expected: 'right' } };
  assert(reportSatisfies(brief, { findings: [] } as any));
  assert(reportSatisfies(brief, { findings: [finding] } as any));
  assert(findingsBackedByVerifiers({ findings: [finding] } as any, [{ findings: [finding] } as any]));
  assert.equal(findingsBackedByVerifiers({ findings: [finding] } as any, [{ findings: [] } as any]), false);
  for (const reproduction of [undefined, { ...finding.reproduction, command: [] }, { ...finding.reproduction, observed: '' }, { ...finding.reproduction, expected: '' }]) {
    assert.equal(reportSatisfies(brief, { findings: [{ ...finding, reproduction }] } as any), false);
  }
});

test('repro verifiers can only continue one adversary worktree', () => {
  const nodes: any[] = [{ key: 'a', profile: 'adversary', task: 'investigate', isolation: 'worktree' }, { key: 'b', profile: 'adversary', task: 'investigate', isolation: 'worktree' }, { key: 'v', profile: 'repro-verifier', task: 'rerun', isolation: 'shared', dependsOn: ['a'] }];
  assert.doesNotThrow(() => planArtifacts(nodes));
  assert.throws(() => planArtifacts(nodes.map(n => n.key === 'v' ? { ...n, dependsOn: ['a', 'b'] } : n)), /exactly one/);
  assert.throws(() => planArtifacts(nodes.map(n => n.key === 'v' ? { ...n, isolation: 'worktree' } : n)), /exactly one/);
});
