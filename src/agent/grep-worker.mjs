import { parentPort, workerData } from "node:worker_threads";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);
const MAX_FILE = 1_000_000;
const MAX_FILES = 5000;
const MAX_LINE = 4096;
function under(base, path) {
  const real = realpathSync(path);
  if (real !== base && !real.startsWith(`${base}${sep}`)) throw new Error("Path escapes child workspace");
  return real;
}
try {
  const { cwd, path, pattern, max } = workerData;
  const base = realpathSync(resolve(cwd));
  const re = new RegExp(pattern, "i");
  const rows = [];
  let files = 0;
  const scan = (candidate) => {
    if (rows.length >= max || files >= MAX_FILES) return;
    const file = under(base, candidate);
    // Never descend through a symlink in traversal, even when its target is inside.
    if (lstatSync(candidate).isSymbolicLink()) return;
    const st = lstatSync(file);
    if (st.isDirectory()) {
      for (const entry of readdirSync(file, { withFileTypes: true })) {
        if (rows.length >= max || files >= MAX_FILES) break;
        if (entry.isSymbolicLink() || (entry.isDirectory() && SKIP_DIRS.has(entry.name))) continue;
        scan(resolve(file, entry.name));
      }
    } else if (st.isFile()) {
      files++;
      if (st.size > MAX_FILE) return;
      let body;
      try { body = readFileSync(file, "utf8"); } catch { return; }
      if (body.includes("\0")) return;
      const lines = body.split(/\r?\n/);
      for (let i = 0; i < lines.length && rows.length < max; i++) {
        if (re.test(lines[i])) rows.push(`${relative(base, file)}:${i + 1}:${lines[i].slice(0, MAX_LINE)}`);
      }
    }
  };
  scan(under(base, path));
  parentPort.postMessage({ result: rows.join("\n") });
} catch (error) { parentPort.postMessage({ error: String(error?.message ?? error) }); }
