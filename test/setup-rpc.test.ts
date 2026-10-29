import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startModelServer, writeModelConfig } from './e2e/harness.ts';

test('real Pi RPC runs setup and dispatches the optional verification follow-up', { timeout: 40_000 }, async () => {
  const root = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'pstack-setup-rpc-'));
  const agentDir = join(dir, 'agent'), home = join(dir, 'home'), project = join(dir, 'project');
  mkdirSync(project);
  const server = await startModelServer(() => ({ text: 'Verification follow-up received.' }));
  writeModelConfig(agentDir, server.port);
  const cli = resolve(root, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
  const child = spawn(process.execPath, [cli, '--mode', 'rpc', '--no-session', '--extension', resolve(root, 'src/extension.ts'), '--provider', 'loopback', '--model', 'loopback-model'], {
    cwd: project,
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PSTACK_NATIVE_HOME: home, PI_OFFLINE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = new Promise<void>(resolveClose => child.once('close', () => resolveClose()));
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '', buffer = '', saved = false, settled = false;
  const titles: string[] = [];
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const send = (record: unknown) => child.stdin.write(`${JSON.stringify(record)}\n`);
  try {
    await new Promise<void>((resolveDone, reject) => {
      const timer = setTimeout(() => reject(new Error(`Pi RPC setup timed out (saved: ${saved}, calls: ${server.calls.length}): ${stderr}`)), 30_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { if (!settled) { clearTimeout(timer); reject(new Error(`Pi RPC exited ${code}: ${stderr}`)); } });
      child.stdout.on('data', chunk => {
        buffer += String(chunk);
        for (;;) {
          const end = buffer.indexOf('\n');
          if (end < 0) break;
          const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
          let event: any;
          try { event = JSON.parse(line); } catch { clearTimeout(timer); reject(new Error(`Invalid Pi RPC record: ${line.slice(0, 200)}`)); return; }
          if (event.type === 'extension_ui_request' && event.method === 'select') {
            titles.push(event.title);
            const value = event.title.startsWith('Child reasoning') ? event.options.find((option: string) => option.startsWith('inherit-parent'))
              : event.title.startsWith('Review pstack') ? 'Save settings' : undefined;
            if (!value) { clearTimeout(timer); reject(new Error(`Unexpected setup dialog: ${event.title}`)); return; }
            send({ type: 'extension_ui_response', id: event.id, value });
          }
          if (event.type === 'extension_ui_request' && event.method === 'notify' && event.message.startsWith('Saved pstack settings')) saved = true;
          if (event.type === 'response' && event.success === false) { clearTimeout(timer); reject(new Error(`Pi RPC: ${event.error}`)); return; }
          if (event.type === 'agent_settled' && saved && server.calls.length) { settled = true; clearTimeout(timer); resolveDone(); return; }
        }
      });
      send({ id: 'setup', type: 'prompt', message: '/setup-pstack' });
    });
    assert(titles.some(title => title.startsWith('Review pstack settings')));
    const config = JSON.parse(readFileSync(join(home, 'models.json'), 'utf8'));
    assert.equal(config.thinkingLevel, 'inherit-parent');
    assert.deepEqual(config.panels.arena, ['loopback/loopback-model', 'loopback/loopback-model']);
    assert.equal(server.calls.length, 1);
    assert(server.calls[0]!.messages.some(message => JSON.stringify(message.content).includes('Complete the optional verification part')));
  } finally {
    child.kill();
    await closed;
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
