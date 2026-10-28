/** Compile the pinned, type-only upstream runtime so Node can execute it inside node_modules. */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

const source = 'skills/statechart/scripts', output = 'dist/statechart';
const check = process.argv.includes('--check');
function compile(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'test') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { compile(path); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const destination = join(output, relative(source, path).replace(/\.ts$/, '.js'));
    let text = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true } }).outputText;
    if (entry.name === 'statechart.ts') {
      const before = 'path.join(import.meta.dirname, "worker.ts")';
      if (!text.includes(before)) throw new Error('STATECHART_WORKER_PATH_DRIFT');
      text = text.replace(before, 'path.join(import.meta.dirname, "worker.js")');
    }
    if (check) {
      if (readFileSync(destination, 'utf8') !== text) throw new Error(`STATECHART_BUILD_DRIFT: ${destination}`);
    } else {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, text);
    }
  }
}
compile(source);
console.log(check ? 'Statechart compiled runtime matches the pinned TypeScript source.' : 'Statechart TypeScript runtime compiled for installed Node packages.');
