import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { relative, resolve, sep } from "node:path";
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);
const MAX_FILE = 1_000_000;
const MAX_RESULTS = 300;
const MAX_TREE_ENTRIES = 20_000;
const MAX_TREE_DEPTH = 32;
const GREP_TIMEOUT_MS = 1500;
const MAX_READ_LINES = 300;
function schema(properties, required = []) {
    return { type: "object", properties, required, additionalProperties: false };
}
function text(value) { return { content: [{ type: "text", text: value }], details: {} }; }
function confined(root, input = ".") {
    const base = realpathSync(resolve(root));
    const candidate = resolve(base, input);
    if (candidate !== base && !candidate.startsWith(`${base}${sep}`))
        throw new Error(`Path escapes child workspace: ${input}`);
    if (!existsSync(candidate))
        throw new Error(`Path does not exist: ${input}`);
    const real = realpathSync(candidate);
    if (real !== base && !real.startsWith(`${base}${sep}`))
        throw new Error(`Path escapes child workspace: ${input}`);
    return real;
}
// Iterative so a deep tree cannot exhaust the call stack, with entry and depth bounds because a
// tree of empty directories never reaches the file limit. `truncated` tells the caller that the
// answer is partial rather than complete.
function walk(root, start, max = MAX_RESULTS) {
    const base = realpathSync(resolve(root));
    const from = confined(base, start);
    if (lstatSync(from).isFile())
        return { files: [relative(base, from) || "."], truncated: false };
    const out = [];
    const pending = [{ path: from, depth: 0 }];
    let visited = 0, truncated = false;
    while (pending.length) {
        const { path, depth } = pending.pop();
        if (depth > MAX_TREE_DEPTH) {
            truncated = true;
            continue;
        }
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            if (visited >= MAX_TREE_ENTRIES || out.length >= max) {
                truncated = true;
                break;
            }
            visited++;
            if (entry.isSymbolicLink())
                continue;
            const child = resolve(path, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name))
                    pending.push({ path: child, depth: depth + 1 });
            }
            else if (entry.isFile())
                out.push(relative(base, child) || ".");
        }
    }
    return { files: out, truncated };
}
export function createReadOnlyTools(cwd) {
    return [
        {
            name: "read", label: "Read", description: "Read a UTF-8 text file inside this child workspace; no paths outside the workspace.",
            parameters: schema({ path: { type: "string" }, offset: { type: "number", minimum: 1 }, limit: { type: "number", minimum: 1, maximum: MAX_READ_LINES } }, ["path"]),
            annotations: { readOnlyHint: true, idempotentHint: true },
            async execute(_id, args) {
                const file = confined(cwd, String(args.path));
                const stat = lstatSync(file);
                if (!stat.isFile())
                    throw new Error(`Not a regular file: ${args.path}`);
                if (stat.size > MAX_FILE)
                    throw new Error(`File exceeds read limit of ${MAX_FILE} bytes`);
                const body = readFileSync(file, "utf8");
                if (body.includes("\0"))
                    throw new Error("Binary files cannot be read with the readonly tool");
                const lines = body.split(/\r?\n/);
                const start = Math.max(0, Math.trunc(Number(args.offset) || 1) - 1);
                const limit = Math.max(1, Math.min(MAX_READ_LINES, Number(args.limit) || 200));
                return text(lines.slice(start, start + limit).map((line, i) => `${i + start + 1}: ${line}`).join("\n") || "(empty)");
            },
        },
        {
            name: "ls", label: "List", description: "List one directory inside the child workspace without modifying it.",
            parameters: schema({ path: { type: "string", description: "Relative path; defaults to ." } }),
            annotations: { readOnlyHint: true, idempotentHint: true },
            async execute(_id, args) {
                const dir = confined(cwd, args.path || ".");
                if (!lstatSync(dir).isDirectory())
                    throw new Error(`Not a directory: ${args.path || "."}`);
                const rows = readdirSync(dir, { withFileTypes: true }).slice(0, MAX_RESULTS).map((e) => `${e.isDirectory() ? "d" : e.isSymbolicLink() ? "l" : "f"} ${e.name}`);
                return text(rows.join("\n") || "(empty)");
            },
        },
        {
            name: "find", label: "Find", description: "Find file paths inside the child workspace by case-insensitive substring. Symlinks and common generated directories are skipped.",
            parameters: schema({ query: { type: "string" }, path: { type: "string" }, maxResults: { type: "number", minimum: 1, maximum: MAX_RESULTS } }, ["query"]),
            annotations: { readOnlyHint: true, idempotentHint: true },
            async execute(_id, args) {
                const query = String(args.query).toLowerCase();
                const max = Math.max(1, Math.min(MAX_RESULTS, Number(args.maxResults) || 100));
                const { files, truncated } = walk(cwd, args.path || ".", MAX_RESULTS * 4);
                const rows = files.filter((p) => p.toLowerCase().includes(query)).slice(0, max);
                const note = truncated ? "\n(walk stopped at the traversal limit; results may be incomplete)" : "";
                return text((rows.join("\n") || "(no matches)") + note);
            },
        },
        {
            name: "grep", label: "Grep", description: "Search UTF-8-sized text files inside the child workspace with a time-limited JavaScript regular expression. Symlinks and generated directories are skipped.",
            parameters: schema({ pattern: { type: "string" }, path: { type: "string" }, maxResults: { type: "number", minimum: 1, maximum: MAX_RESULTS } }, ["pattern"]),
            annotations: { readOnlyHint: true, idempotentHint: true },
            async execute(_id, args) {
                const pattern = String(args.pattern);
                if (pattern.length > 1024)
                    throw new Error("Search pattern is too long");
                const max = Math.max(1, Math.min(MAX_RESULTS, Number(args.maxResults) || 100));
                const dir = confined(cwd, args.path || ".");
                return await new Promise((resolve, reject) => {
                    const worker = new Worker(new URL("./grep-worker.mjs", import.meta.url), {
                        workerData: { cwd, path: dir, pattern, max },
                    });
                    let settled = false;
                    const finish = (error, result) => {
                        if (settled)
                            return;
                        settled = true;
                        clearTimeout(timer);
                        void worker.terminate();
                        if (error)
                            reject(error);
                        else
                            resolve(text(result || "(no matches)"));
                    };
                    const timer = setTimeout(() => finish(new Error(`grep exceeded ${GREP_TIMEOUT_MS}ms CPU/time limit`)), GREP_TIMEOUT_MS);
                    worker.once("message", (value) => {
                        if (value.error)
                            finish(new Error(value.error));
                        else
                            finish(undefined, value.result);
                    });
                    worker.once("error", (error) => finish(error));
                    worker.once("exit", (code) => { if (code !== 0)
                        finish(new Error(`grep worker exited with code ${code}`)); });
                });
            },
        },
    ];
}
