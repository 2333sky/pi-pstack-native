import { fileURLToPath } from "node:url";
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { homePath, lockPath } from "../runtime/home.js";
import { FileLock } from "../runtime/lock.js";
import { hash, uid, transact, protocol } from "../runtime/protocol.js";
import { fingerprint, capture, sameFingerprint, git } from "../artifacts/fingerprint.js";
import { changedPaths, matchPath, scopeViolations, validateBrief, reportSatisfies } from "../contracts/brief.js";
export function loadRunnerPolicy() {
    try {
        return JSON.parse(readFileSync(homePath('verification-policy.json'), 'utf8'));
    }
    catch {
        return { commands: [] };
    }
}
function redact(s) {
    return s.replace(/(authorization\s*[:=]\s*(?:bearer\s+)?|(?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,"'}]+/gi, '$1[REDACTED]').replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/g, 'https://[REDACTED]@');
}
function filePath(cwd, path) {
    const base = realpathSync(cwd);
    const candidate = realpathSync(resolve(base, path));
    const rel = relative(base, candidate);
    if (isAbsolute(path) || isAbsolute(rel) || rel === '..' || rel.startsWith('../'))
        throw new Error('Gate path escapes artifact');
    return candidate;
}
async function command(cwd, gate, policy, signal) {
    if (!gate.command?.length || !policy.commands?.some(c => JSON.stringify(c) === JSON.stringify(gate.command)))
        return { status: 'blocked', log: '', reason: 'COMMAND_NOT_ALLOWED' };
    if (!['none', 'local', 'remote'].includes(gate.sideEffect ?? '') || gate.sideEffect === 'local' && !policy.allowLocal || gate.sideEffect === 'remote' && !policy.allowRemote)
        return { status: 'blocked', log: '', reason: 'SIDE_EFFECT_NOT_AUTHORIZED' };
    if (signal?.aborted)
        return { status: 'blocked', log: '', reason: 'CANCELLED' };
    return new Promise(resolveResult => {
        const duration = Math.max(1, Math.min(gate.timeoutSeconds ?? 120, policy.maxTimeoutSeconds ?? 300)) * 1000;
        const child = spawn(process.execPath, [fileURLToPath(new URL('./process.mjs', import.meta.url)), String(duration), ...gate.command], { cwd, shell: false, detached: process.platform !== 'win32', env: { PATH: process.env.PATH ?? '', ...policy.environment } });
        let log = '';
        let reason;
        const cap = Math.max(1024, Math.min(policy.maxOutputBytes ?? 65536, 4 * 1024 * 1024));
        const collect = (b) => { log = (log + b.toString('utf8')).slice(-cap); };
        child.stdout?.on('data', collect);
        child.stderr?.on('data', collect);
        const kill = (why) => { reason = why; try {
            if (process.platform !== 'win32' && child.pid)
                process.kill(-child.pid, 'SIGKILL');
            else
                child.kill('SIGKILL');
        }
        catch { } };
        const timer = setTimeout(() => kill('TIMEOUT'), duration);
        const abort = () => kill('CANCELLED');
        signal?.addEventListener('abort', abort, { once: true });
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        child.on('error', error => { cleanup(); resolveResult({ status: 'blocked', reason: 'ENVIRONMENT_UNAVAILABLE', log: redact(error.message) }); });
        child.on('close', code => { cleanup(); resolveResult({ status: reason || code === 124 || code === 125 || code === 127 ? 'blocked' : code === 0 ? 'passed' : 'failed', exitCode: code, reason, log: redact(log) }); });
    });
}
export function parseTestReport(text, format) {
    if (format === 'tap') {
        const plan = text.match(/^1\.\.(\d+)\s*$/m);
        const tests = text.match(/^(?:not )?ok\s+\d+.*$/gm) ?? [];
        return Boolean(plan && Number(plan[1]) > 0 && tests.length === Number(plan[1]) && !/^not ok\b/m.test(text) && !/Bail out!/i.test(text) && !tests.some(t => /#\s*(SKIP|TODO)/i.test(t)));
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
        throw new Error('Unsafe XML');
    const suites = [...text.matchAll(/<testsuite\b([^>]*)>/g)];
    if (!suites.length || !/<\/testsuite>/.test(text) || /<(failure|error|skipped)\b/.test(text))
        return false;
    return suites.every(([, attrs]) => {
        const n = (key) => { const m = attrs.match(new RegExp(`\\b${key}=["'](\\d+)["']`)); return m ? Number(m[1]) : undefined; };
        return (n('tests') ?? 0) > 0 && n('failures') === 0 && n('errors') === 0 && (n('skipped') ?? 0) === 0;
    });
}
export function ledgerCurrent(entry, current) {
    const state = protocol();
    return entry.status === 'passed' && !state.invalidations[entry.id] && sameFingerprint(entry.fingerprint, current) && entry.evidenceRefs.length > 0 && entry.evidenceRefs.every(id => {
        const e = state.evidence[id];
        if (!e || e.status !== 'passed')
            return false;
        try {
            return hash(readFileSync(e.logPath, 'utf8')) === e.checksum;
        }
        catch {
            return false;
        }
    });
}
export function invalidate(cwd, reason) {
    const current = fingerprint(cwd);
    return transact('ledger-invalidation', current.repoId, 'runtime', s => {
        const ids = Object.values(s.ledgers).filter(e => e.fingerprint.repoId === current.repoId && !sameFingerprint(e.fingerprint, current) && !s.invalidations[e.id]).map(e => e.id);
        for (const id of ids)
            s.invalidations[id] = { at: new Date().toISOString(), reason };
        return ids;
    });
}
export async function verify(cwd, brief, options = {}) {
    validateBrief(brief);
    const actor = options.actor ?? 'verification-runner';
    const policy = options.policy ?? loadRunnerPolicy();
    const lock = new FileLock(lockPath(`verify-${hash(realpathSync(cwd))}`));
    const deadline = Date.now() + 5000;
    while (!lock.acquire()) {
        if (Date.now() >= deadline || options.signal?.aborted)
            throw new Error('VERIFICATION_BUSY_OR_CANCELLED');
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    try {
        const artifact = capture(cwd, undefined, options.parents, options.pr ? 'committed' : 'working');
        if (brief.scope.repoId !== artifact.fingerprint.repoId)
            throw new Error('REPOSITORY_MISMATCH');
        if (options.pr && (options.pr.repoId !== artifact.fingerprint.repoId || options.pr.headSha !== artifact.fingerprint.commitSha))
            throw new Error('PR_HEAD_MISMATCH');
        const paths = options.before ? changedPaths(options.before, artifact.fingerprint) : git(cwd, ['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean).concat(git(cwd, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean));
        const violations = scopeViolations(brief, paths);
        const requiredIds = new Set(brief.acceptance.filter(ac => ac.required).flatMap(ac => ac.gateIds));
        const results = [];
        const nonce = uid('exec');
        for (const gate of brief.verification) {
            const id = uid('ev');
            const startedAt = new Date().toISOString();
            const logPath = homePath('evidence', `${id}.log`);
            let status = 'blocked';
            let log = '';
            let reason;
            let exitCode;
            transact('gate-started', id, actor, s => { s.evidence[id] = { id, gateId: gate.id, gateDefinitionHash: hash(gate), status: 'running', cwd, startedAt, finishedAt: startedAt, artifactId: artifact.id, logPath, checksum: '', actor, environmentHash: hash({ node: process.version, platform: process.platform, policy }) }; return { id }; });
            try {
                if (violations.length) {
                    reason = 'SCOPE_VIOLATION';
                    log = JSON.stringify(violations);
                }
                else if (gate.coverage && paths.some(p => !gate.coverage.some(g => matchPath(p, g))))
                    reason = 'INSUFFICIENT_COVERAGE';
                else if (gate.kind === 'command' || gate.kind === 'test-report' && gate.command) {
                    const r = await command(cwd, gate, policy, options.signal);
                    status = r.status;
                    log = r.log;
                    reason = r.reason;
                    exitCode = r.exitCode;
                    if (status === 'passed' && gate.kind === 'test-report')
                        status = parseTestReport(readFileSync(filePath(cwd, gate.path), 'utf8'), gate.format) ? 'passed' : 'failed';
                }
                else if (gate.kind === 'file') {
                    log = readFileSync(filePath(cwd, gate.path), 'utf8');
                    status = !gate.pattern || new RegExp(gate.pattern).test(log) ? 'passed' : 'failed';
                }
                else if (gate.kind === 'diff') {
                    log = JSON.stringify(paths);
                    status = paths.length <= (gate.maxFiles ?? Infinity) ? 'passed' : 'failed';
                }
                else if (gate.kind === 'test-report') {
                    log = readFileSync(filePath(cwd, gate.path), 'utf8');
                    status = parseTestReport(log, gate.format) ? 'passed' : 'failed';
                }
                else if (gate.kind === 'human-approval') {
                    const approval = protocol().approvals[hash({ fingerprint: artifact.fingerprint, gate: hash(gate) })];
                    status = approval ? 'passed' : 'blocked';
                    reason = approval ? undefined : 'HUMAN_APPROVAL_REQUIRED';
                    log = JSON.stringify(approval ?? {});
                }
                else {
                    reason = 'ADVISORY_ONLY';
                }
            }
            catch (error) {
                status = 'blocked';
                reason = 'CHECK_UNAVAILABLE';
                log = String(error);
            }
            log = redact(log).slice(-Math.min(policy.maxOutputBytes ?? 65536, 4 * 1024 * 1024));
            mkdirSync(dirname(logPath), { recursive: true });
            writeFileSync(logPath, log, { mode: 0o600 });
            const evidence = { id, gateId: gate.id, gateDefinitionHash: hash(gate), status, reason, command: gate.command, cwd, exitCode, startedAt, finishedAt: new Date().toISOString(), artifactId: artifact.id, logPath, checksum: hash(log), actor, environmentHash: hash({ node: process.version, platform: process.platform, policy }) };
            results.push(evidence);
            transact('gate-settled', id, actor, s => { s.evidence[id] = evidence; return { id, status, reason }; });
        }
        const required = results.filter(e => brief.verification.find(g => g.id === e.gateId)?.required !== false || requiredIds.has(e.gateId));
        let status = required.length === 0 ? 'blocked' : required.some(e => e.status === 'failed') ? 'failed' : required.some(e => e.status !== 'passed') ? 'blocked' : 'passed';
        try {
            if (!sameFingerprint(artifact.fingerprint, fingerprint(cwd, options.pr ? 'committed' : 'working')))
                status = 'stale';
        }
        catch {
            status = 'stale';
        }
        const categories = brief.verification.filter(g => (g.required !== false || requiredIds.has(g.id)) && ['command', 'test-report'].includes(g.kind)).map(g => g.category);
        const r = options.report;
        const contractAccepted = brief.contractLevel === 'minimal' || Boolean(r && r.status === 'completed' && reportSatisfies(brief, r) && r.head === artifact.fingerprint.commitSha && r.base === (options.before?.commitSha ?? artifact.fingerprint.commitSha) && !r.deviations.length && !r.unresolved.length);
        const ledger = { contractAccepted, id: uid('ver'), artifactId: artifact.id, fingerprint: artifact.fingerprint, evidenceRefs: required.map(e => e.id), gateIds: required.map(e => e.gateId), gateDefinitionHash: hash(brief), status, verdict: status === 'passed' ? (categories.includes('behavior') ? 'unit-test-verified' : 'type-check-only') : status === 'failed' ? 'verifier-failed' : status === 'blocked' ? 'verifier-blocked' : 'not-verified', verifiedAt: new Date().toISOString(), verifiedBy: actor, executionNonce: nonce, pr: options.pr };
        transact('verification-recorded', ledger.id, actor, s => { s.ledgers[ledger.id] = ledger; return ledger; });
        return ledger;
    }
    finally {
        lock.release();
    }
}
