import { loadModels } from "../runtime/config.js";
import { validateBrief, saveBrief, validateBudget, reportSatisfies } from "../contracts/brief.js";
import { verify, ledgerCurrent } from "../verification/runner.js";
import { fingerprint } from "../artifacts/fingerprint.js";
import { protocol, hash, transact } from "../runtime/protocol.js";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { getProfile } from "../agent/profiles.js";
import { loadConfig } from "../runtime/config.js";
import { durableError } from "../runtime/errors.js";
import { journalPath, lockPath, workflowPath } from "../runtime/home.js";
import { FileLock } from "../runtime/lock.js";
import { appendJournal, listJson, readJson, writeJsonAtomic } from "../runtime/store.js";
import { updateRecord } from "../runtime/transaction.js";
import { dependencyEdges, downstreamKeys, validateGraph } from "./graph.js";
import { planArtifacts, PARENT_ARTIFACT } from "./artifacts.js";
function now() { return new Date().toISOString(); }
function workflowId() { return `wf_${randomUUID().replaceAll("-", "").slice(0, 12)}`; }
function agentId(wf, key, attempt) {
    const safe = key.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 24);
    return `ag_${wf.slice(3, 11)}_${safe}_${attempt}`;
}
const TERMINAL = new Set(["completed", "failed", "cancelled", "skipped"]);
export class WorkflowEngine {
    running = new Map();
    notifyOnTerminal = new Set();
    agents;
    onTerminal;
    constructor(agents, onTerminal) {
        this.agents = agents;
        this.onTerminal = onTerminal;
    }
    create(spec) {
        validateGraph(spec.nodes);
        validateBudget(spec.budget);
        for (const node of spec.nodes)
            validateBudget(node.budget);
        for (const node of spec.nodes) {
            if (spec.contractLevel === "strict" && !node.brief)
                throw new Error(`BRIEF_INCOMPLETE: ${node.key}.brief`);
            if (node.brief) {
                validateBrief(node.brief);
                if (node.brief.scope.repoId !== fingerprint(spec.cwd).repoId)
                    throw new Error("REPOSITORY_MISMATCH");
            }
        }
        planArtifacts(spec.nodes);
        for (const node of spec.nodes)
            if (node.brief)
                saveBrief(node.brief, "coordinator", "workflow-created");
        const id = workflowId();
        const createdAt = now();
        const calls = {};
        for (const node of spec.nodes) {
            calls[node.key] = {
                brief: node.brief, thinkingLevel: node.thinkingLevel, budget: node.budget,
                key: node.key, profile: node.profile ?? "worker", task: node.task.trim(),
                state: "pending", dependsOn: [...(node.dependsOn ?? [])], attempt: 0,
                ...(node.model || loadModels().workflows?.[spec.playbook ?? spec.type ?? "graph"]?.[node.profile ?? "worker"] ? { model: node.model ?? loadModels().workflows?.[spec.playbook ?? spec.type ?? "graph"]?.[node.profile ?? "worker"] } : {}),
                ...(node.isolation ? { isolation: node.isolation } : {}),
            };
        }
        const record = {
            id, revision: 0, schemaVersion: 2, reviewFingerprint: spec.type === "review" ? fingerprint(spec.cwd) : undefined, budget: spec.budget, verification: "unknown",
            ...(spec.name ? { name: spec.name } : {}),
            type: spec.type ?? "graph", state: "created", createdAt, updatedAt: createdAt,
            ...(spec.parentSessionId ? { parentSessionId: spec.parentSessionId } : {}),
            parentCwd: spec.cwd, calls, edges: dependencyEdges(spec.nodes),
            maxConcurrency: Math.max(1, Math.min(16, spec.maxConcurrency ?? loadConfig().defaultConcurrency)),
            upstreamContext: {
                pstackVersion: spec.pstackVersion ?? "0.15.15",
                ...(spec.skill ? { skill: spec.skill } : {}),
                ...(spec.playbook ? { playbook: spec.playbook } : {}),
            },
        };
        writeJsonAtomic(workflowPath(id), record);
        appendJournal(journalPath(id), { type: "workflow-created", id, nodes: Object.keys(calls) });
        return record;
    }
    get(id) { return readJson(workflowPath(id), undefined); }
    list(sessionId) {
        return listJson(dirname(workflowPath("x")))
            .filter((record) => !sessionId || record.parentSessionId === sessionId)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    /** Read, mutate and journal under one short lock; never save a stale snapshot. */
    change(id, type, mutate, extra = {}) {
        return updateRecord("workflow", id, workflowPath(id), (record) => {
            mutate(record);
            record.updatedAt = now();
        }, () => appendJournal(journalPath(id), { type, ...extra }));
    }
    start(id, ctx) {
        const record = this.get(id);
        if (!record)
            throw new Error(`Unknown workflow: ${id}`);
        if (["completed", "failed", "cancelled", "cancelling", "paused"].includes(record.state))
            return record;
        this.notifyOnTerminal.add(id);
        if (this.running.has(id))
            return record;
        const promise = this.execute(id, ctx);
        this.running.set(id, promise);
        void promise.then(() => this.running.delete(id), () => this.running.delete(id));
        return record;
    }
    async run(id, ctx) {
        const existing = this.running.get(id);
        if (existing)
            return existing;
        const promise = this.execute(id, ctx);
        this.running.set(id, promise);
        try {
            return await promise;
        }
        finally {
            this.running.delete(id);
        }
    }
    pause(id) {
        return this.change(id, "workflow-paused", (record) => {
            if (["completed", "failed", "cancelled", "cancelling"].includes(record.state))
                throw new Error(`Workflow ${id} is ${record.state}; it cannot be paused.`);
            record.state = "paused";
        });
    }
    resume(id, ctx) {
        const record = this.change(id, "workflow-resumed", (latest) => {
            if (!["paused", "blocked"].includes(latest.state))
                throw new Error(`Workflow ${id} is ${latest.state}; resume applies only to paused or blocked workflows.`);
            latest.state = "created";
        });
        this.start(id, ctx);
        return record;
    }
    finishCancellation(id) {
        return this.change(id, "workflow-cancellation-check", (record) => {
            if (record.state !== "cancelling")
                return;
            if (Object.values(record.calls).every((call) => TERMINAL.has(call.state))) {
                record.state = "cancelled";
                record.cancelledAt ??= now();
            }
        });
    }
    async cancel(id) {
        const request = this.change(id, "workflow-cancellation-requested", (record) => {
            if (["completed", "failed", "cancelled"].includes(record.state))
                return;
            record.state = "cancelling";
            record.cancelledAt ??= now();
            for (const call of Object.values(record.calls)) {
                if (["pending", "ready", "waiting", "skipped"].includes(call.state)) {
                    call.state = "cancelled";
                    call.finishedAt = now();
                }
            }
        });
        if (request.state !== "cancelling")
            return request;
        const running = Object.values(request.calls).filter((call) => call.state === "running" && call.agentId);
        await Promise.all(running.map(async (call) => {
            try {
                const agent = await this.agents.stop(call.agentId);
                this.change(id, "call-cancellation-observed", (record) => {
                    const current = record.calls[call.key];
                    if (!current || record.state !== "cancelling" || current.state !== "running")
                        return;
                    if (TERMINAL.has(agent.state)) {
                        current.state = "cancelled";
                        current.finishedAt = now();
                    }
                }, { key: call.key, agentId: agent.id });
            }
            catch (error) {
                this.change(id, "call-cancellation-unconfirmed", (record) => {
                    const current = record.calls[call.key];
                    if (current?.state === "running")
                        current.error = durableError("CANCEL_NOT_CONFIRMED", error, true);
                }, { key: call.key });
            }
        }));
        return this.finishCancellation(id);
    }
    retry(id, key) {
        return this.change(id, "workflow-retry", (record) => {
            if (["running", "cancelling"].includes(record.state))
                throw new Error(`Workflow ${id} is ${record.state}; stop all agents before retry.`);
            const call = record.calls[key];
            if (!call)
                throw new Error(`Unknown workflow call: ${key}`);
            if (!["failed", "cancelled", "skipped"].includes(call.state))
                throw new Error(`Call ${key} is ${call.state}; retry only failed/cancelled/skipped calls.`);
            const clear = (target) => {
                target.state = "pending";
                delete target.error;
                delete target.result;
                delete target.agentId;
                delete target.startedAt;
                delete target.finishedAt;
                delete target.verification;
                delete target.artifactId;
                delete target.report;
            };
            clear(call);
            for (const downstream of downstreamKeys(record.calls, key)) {
                const next = record.calls[downstream];
                clear(next);
            }
            record.state = "created";
            delete record.error;
            delete record.cancelledAt;
        }, { key });
    }
    recoverSession(sessionId, ctx) {
        const recoverable = this.list(sessionId).filter((record) => ["created", "running", "blocked"].includes(record.state));
        for (const record of recoverable)
            this.start(record.id, ctx);
        // Cancellation is never silently converted back to running after restart.
        for (const record of this.list(sessionId).filter((r) => r.state === "cancelling"))
            void this.cancel(record.id).catch(() => { });
        return recoverable;
    }
    async execute(id, ctx) {
        const lock = new FileLock(lockPath(`workflow-${id}`), 60 * 60_000);
        if (!lock.acquire()) {
            const record = this.get(id);
            if (!record)
                throw new Error(`Unknown workflow: ${id}`);
            return record;
        }
        try {
            let record = this.get(id);
            if (!record)
                throw new Error(`Unknown workflow: ${id}`);
            if (["completed", "failed", "cancelled", "cancelling", "paused"].includes(record.state))
                return record;
            this.change(id, "workflow-running", (latest) => {
                if (!["created", "running", "blocked"].includes(latest.state))
                    return;
                latest.state = "running";
            });
            for (const call of Object.values(this.get(id).calls)) {
                if (call.state === "completed" && call.brief && !this.accepted(call)) {
                    const agent = call.agentId ? this.agents.get(call.agentId) : undefined;
                    if (agent)
                        await this.verifyCall(id, call.key, agent);
                }
            }
            const active = new Map();
            const attachCall = (key, recovering = false) => {
                const latest = this.change(id, recovering ? "call-resuming" : "call-started", (current) => {
                    if (current.state !== "running")
                        return;
                    const call = current.calls[key];
                    if (!recovering)
                        call.attempt += 1;
                    if (call.attempt < 1)
                        call.attempt = 1;
                    call.agentId ??= agentId(current.id, key, call.attempt);
                    call.state = "running";
                    call.startedAt ??= now();
                }, { key });
                const call = latest.calls[key];
                if (latest.state !== "running" || call.state !== "running" || !call.agentId)
                    return;
                const idForAgent = call.agentId;
                const prior = recovering ? this.agents.get(idForAgent) : undefined;
                const target = this.executionTarget(latest, call);
                const promise = (prior
                    ? this.agents.recover(prior, ctx)
                    : this.agents.run({
                        id: idForAgent, workflowId: latest.id, callKey: key, profile: call.profile,
                        task: this.taskWithDependencies(latest, call), cwd: target.cwd,
                        isolation: target.isolation, model: call.model, attempt: call.attempt, brief: call.brief, thinkingLevel: call.thinkingLevel, budget: call.budget,
                    }, ctx)).then(async (agent) => {
                    this.change(id, "call-settled", (current) => {
                        const node = current.calls[key];
                        if (!node || node.agentId !== agent.id || node.state !== "running")
                            return;
                        node.finishedAt = now();
                        node.cwd = agent.worktree ?? agent.cwd;
                        node.model = agent.model ?? node.model;
                        node.report = agent.report;
                        node.usage = agent.usage;
                        if (current.state === "cancelling") {
                            node.state = "cancelled";
                        }
                        else if (agent.state === "completed") {
                            node.state = "completed";
                            node.result = agent.result;
                            delete node.error;
                        }
                        else if (agent.state === "cancelled") {
                            node.state = "cancelled";
                        }
                        else {
                            node.state = "failed";
                            node.error = agent.error ?? durableError("AGENT_FAILED", `Agent ${agent.id} did not complete (${agent.state})`, true);
                        }
                    }, { key, agentId: agent.id });
                    const currentCall = this.get(id)?.calls[key];
                    if (agent.state === "completed" && currentCall?.state === "completed" && currentCall.brief) {
                        await this.verifyCall(id, key, agent);
                    }
                }).catch((error) => {
                    this.change(id, "call-failed", (current) => {
                        const node = current.calls[key];
                        if (!node || node.state !== "running")
                            return;
                        node.state = current.state === "cancelling" ? "cancelled" : "failed";
                        node.finishedAt = now();
                        node.error = durableError("CALL_FAILED", error, true);
                    }, { key });
                }).finally(() => { active.delete(key); });
                active.set(key, promise);
            };
            // Running calls from a dead process must retain their original attempt.
            for (const [key, call] of Object.entries(this.get(id).calls)) {
                if (call.state === "running" && call.agentId && active.size < record.maxConcurrency)
                    attachCall(key, true);
            }
            while (true) {
                record = this.get(id);
                // Resume may happen while a paused executor is still draining active calls.
                // Rejoin the same executor instead of spinning forever on `created`.
                if (record.state === "created" || record.state === "blocked") {
                    record = this.change(id, "workflow-running", (current) => {
                        if (["created", "blocked"].includes(current.state))
                            current.state = "running";
                    });
                }
                if (record.state === "cancelled") {
                    if (this.notifyOnTerminal.delete(id))
                        this.onTerminal?.(record);
                    return record;
                }
                if (record.state === "cancelling") {
                    if (active.size === 0) {
                        const settled = this.finishCancellation(id);
                        if (settled.state === "cancelled" && this.notifyOnTerminal.delete(id))
                            this.onTerminal?.(settled);
                        return settled;
                    }
                    await Promise.race(active.values());
                    continue;
                }
                if (record.state === "paused") {
                    if (active.size === 0)
                        return record;
                    await Promise.race(active.values());
                    continue;
                }
                for (const [key, call] of Object.entries(record.calls)) {
                    if (active.size >= record.maxConcurrency)
                        break;
                    if (call.state !== "running" || !call.agentId || active.has(key))
                        continue;
                    attachCall(key, true);
                    record = this.get(id);
                }
                for (const key of Object.keys(record.calls)) {
                    this.change(id, "dependency-checked", (current) => {
                        if (current.state !== "running")
                            return;
                        const call = current.calls[key];
                        if (!["pending", "ready"].includes(call.state))
                            return;
                        const deps = call.dependsOn.map((dep) => current.calls[dep]);
                        if (deps.some((dep) => ["failed", "cancelled", "skipped"].includes(dep.state))) {
                            call.state = "skipped";
                            call.finishedAt = now();
                            call.error = durableError("DEPENDENCY_FAILED", `Dependency failed for ${call.key}`, false);
                        }
                    }, { key });
                }
                const used = Object.values(record.calls).reduce((a, c) => ({ tokens: a.tokens + (c.usage?.tokens ?? 0), cost: a.cost + (c.usage?.cost ?? 0) }), { tokens: 0, cost: 0 });
                const budget = record.budget;
                const exhausted = budget && (budget.maxTokens !== undefined && used.tokens >= budget.maxTokens || budget.maxCost !== undefined && used.cost >= budget.maxCost || budget.maxTimeSeconds !== undefined && Date.now() - Date.parse(record.createdAt) >= budget.maxTimeSeconds * 1000);
                if (exhausted && active.size === 0)
                    return this.change(id, "budget-exhausted", w => { w.state = "blocked"; w.error = durableError("BUDGET_EXCEEDED", "Budget exhausted; pending calls retained", true); });
                for (const key of Object.keys(record.calls)) {
                    if (exhausted)
                        break;
                    record = this.get(id);
                    if (record.state !== "running" || active.size >= record.maxConcurrency)
                        break;
                    const call = record.calls[key];
                    if (!["pending", "ready"].includes(call.state))
                        continue;
                    if (!call.dependsOn.every((dep) => record.calls[dep]?.state === "completed" && !active.has(dep) && this.accepted(record.calls[dep])))
                        continue;
                    this.change(id, "call-ready", (latest) => {
                        if (latest.state === "running" && latest.calls[key]?.state === "pending")
                            latest.calls[key].state = "ready";
                    }, { key });
                    if (this.get(id)?.state === "running")
                        attachCall(key);
                }
                record = this.get(id);
                if (record.state !== "running")
                    continue;
                const calls = Object.values(record.calls);
                if (calls.every((call) => TERMINAL.has(call.state)) && active.size === 0) {
                    const result = this.change(id, "workflow-settled", (latest) => {
                        if (latest.state !== "running")
                            return;
                        const failures = Object.values(latest.calls).filter((call) => call.state !== "completed");
                        const rejected = Object.values(latest.calls).filter(call => call.brief && !latest.edges.some(e => e.from === call.key) && !this.accepted(call));
                        if (!failures.length && rejected.length) {
                            latest.state = "blocked";
                            latest.verification = "blocked";
                            latest.error = durableError("ACCEPTANCE_BLOCKED", rejected.map(c => `${c.key}: ${c.verification?.reason ?? c.verification?.status ?? "unverified"}`).join(", "), true);
                        }
                        else if (!failures.length) {
                            latest.state = "completed";
                            latest.verification = Object.values(latest.calls).filter(c => !latest.edges.some(e => e.from === c.key)).every(c => c.brief && this.accepted(c)) ? "verified" : "unknown";
                            latest.result = Object.values(latest.calls).map((call) => `## ${call.key}\n${call.result ?? ""}`).join("\n\n");
                        }
                        else {
                            latest.state = "failed";
                            latest.error = durableError("WORKFLOW_FAILED", `${failures.length} call(s) did not complete: ${failures.map((x) => x.key).join(", ")}`, failures.some((x) => x.error?.retryable));
                        }
                    });
                    if (this.notifyOnTerminal.delete(id))
                        this.onTerminal?.(result);
                    return result;
                }
                if (active.size === 0) {
                    return this.change(id, "workflow-blocked", (current) => {
                        if (current.state === "running")
                            current.state = "blocked";
                    });
                }
                await Promise.race(active.values());
            }
        }
        finally {
            lock.release();
        }
    }
    acceptedWorkflow(record) {
        return record.state === "completed" && Object.values(record.calls).filter(c => !record.edges.some(e => e.from === c.key)).every(c => Boolean(c.brief) && this.accepted(c));
    }
    accepted(call) {
        if (!call.brief)
            return true;
        if (call.verification?.status !== "passed" || !call.verification.ledgerId || !call.cwd)
            return false;
        const entry = protocol().ledgers[call.verification.ledgerId];
        try {
            return Boolean(entry && entry.gateDefinitionHash === hash(call.brief) && ledgerCurrent(entry, fingerprint(call.cwd)));
        }
        catch {
            return false;
        }
    }
    async verifyCall(id, key, agent) {
        const call = this.get(id).calls[key];
        if (!call.brief)
            return;
        const cwd = agent.worktree ?? agent.cwd;
        this.change(id, "verification-started", w => { w.calls[key].verification = { status: "running" }; });
        try {
            const parents = call.dependsOn.flatMap(d => this.get(id).calls[d].artifactId ?? []);
            const ledger = await verify(cwd, call.brief, { before: agent.baseline, parents, report: agent.report });
            const report = agent.report;
            let reason;
            if (call.brief.contractLevel === "strict") {
                if (!report || report.status !== "completed" || !reportSatisfies(call.brief, report) || report.unresolved.length || report.deviations.length || report.head !== ledger.fingerprint.commitSha || !agent.baseline || report.base !== agent.baseline.commitSha)
                    reason = "TASK_REPORT_INCOMPLETE_OR_MISMATCH";
            }
            this.change(id, "verification-settled", w => {
                const c = w.calls[key];
                c.artifactId = ledger.artifactId;
                // Machine evidence enriches the report; claims never create evidence.
                if (report)
                    c.report = { ...report, artifactRefs: [ledger.artifactId], evidenceRefs: ledger.evidenceRefs };
                c.verification = { status: reason ? "blocked" : ledger.status, ledgerId: ledger.id, reason };
            });
            transact("completion-inbox", id, "workflow-engine", () => ({ key, agentId: agent.id, ledgerId: ledger.id, status: reason ? "blocked" : ledger.status }));
        }
        catch (error) {
            this.change(id, "verification-blocked", w => { w.calls[key].verification = { status: "blocked", reason: String(error) }; });
        }
    }
    reviseBrief(id, key, brief, actor, reason) {
        const call = this.get(id)?.calls[key];
        if (!call)
            throw new Error("UNKNOWN_CALL");
        if (call.state === "running")
            throw new Error("RUNNING_BRIEF_UPDATE_REQUIRES_PAUSE_AND_STOP");
        saveBrief(brief, actor, reason);
        return this.change(id, "brief-updated", w => { w.calls[key].brief = brief; delete w.calls[key].verification; w.verification = "stale"; });
    }
    artifactPlan(record) {
        return planArtifacts(Object.values(record.calls).map((call) => ({
            key: call.key, profile: call.profile, task: call.task,
            dependsOn: call.dependsOn, isolation: call.isolation,
        })));
    }
    /** Resolve the most recent actual writer of one artifact lane, even through synthesizer nodes. */
    artifactWorkspace(record, key, lane) {
        const plan = this.artifactPlan(record);
        const seen = new Set();
        const locate = (nodeKey) => {
            if (seen.has(nodeKey))
                return undefined;
            seen.add(nodeKey);
            const node = record.calls[nodeKey];
            if (!node)
                return undefined;
            if (getProfile(node.profile).writable && plan.origin.get(nodeKey)?.has(lane)) {
                const agent = node.agentId ? this.agents.get(node.agentId) : undefined;
                return agent?.worktree ?? agent?.cwd ?? node.cwd;
            }
            for (const dep of [...node.dependsOn].reverse()) {
                const found = locate(dep);
                if (found)
                    return found;
            }
            return undefined;
        };
        const found = locate(key);
        if (!found)
            throw new Error(`Cannot resolve artifact ${lane} for ${key}; refusing to inspect or edit the wrong checkout.`);
        return found;
    }
    executionTarget(record, call) {
        const plan = this.artifactPlan(record);
        const profile = getProfile(call.profile);
        const laneSet = plan.origin.get(call.key);
        const lane = [...laneSet][0];
        if (profile.name === "integrator")
            return { cwd: record.parentCwd, isolation: "shared" };
        if (!profile.writable) {
            if (laneSet.size === 1 && lane && lane !== PARENT_ARTIFACT) {
                return { cwd: this.artifactWorkspace(record, call.key, lane), isolation: "readonly" };
            }
            return { cwd: record.parentCwd, isolation: "readonly" };
        }
        // A writer continuing a previously produced lane must use that exact checkout.
        const previous = call.dependsOn.find((dep) => plan.origin.get(dep)?.has(lane));
        if (previous && lane && lane !== call.key) {
            return { cwd: this.artifactWorkspace(record, previous, lane), isolation: "shared" };
        }
        if (call.isolation === "worktree" || (lane && plan.isolated.has(lane))) {
            return { cwd: record.parentCwd, isolation: "worktree" };
        }
        return { cwd: record.parentCwd, isolation: "shared" };
    }
    taskWithDependencies(record, call) {
        if (call.dependsOn.length === 0)
            return call.task;
        const evidence = call.dependsOn.map((dep) => {
            const source = record.calls[dep];
            const agent = source?.agentId ? this.agents.get(source.agentId) : undefined;
            const artifact = [
                agent?.worktree ? `workspace: ${agent.worktree}` : source?.cwd ? `workspace: ${source.cwd}` : undefined,
                agent?.branch ? `branch: ${agent.branch}` : undefined,
                source?.agentId ? `agent: ${source.agentId}` : undefined,
            ].filter(Boolean).join("\n");
            return `### Result from ${dep}\n${artifact ? `${artifact}\n` : ""}${source?.result ?? "(no result)"}`;
        }).join("\n\n");
        const integrationEvidence = call.profile === "integrator"
            ? Object.entries(record.calls).filter(([key, source]) => {
                const upstream = this.artifactPlan(record).ancestors.get(call.key);
                return upstream.has(key) && getProfile(source.profile).writable;
            }).map(([key, source]) => {
                const agent = source.agentId ? this.agents.get(source.agentId) : undefined;
                return `- ${key}: workspace: ${agent?.worktree ?? agent?.cwd ?? source.cwd ?? "unavailable"}` +
                    (agent?.branch ? `; branch: ${agent.branch}` : "");
            }).join("\n")
            : "";
        const integration = call.profile === "integrator"
            ? `\n\nYou are the explicit integration owner. The current working directory is the target checkout. Inspect ALL upstream writer artifacts, including those behind read-only handoffs:\n${integrationEvidence}\nFor committed work, identify dependency-only commits relative to the common base and integrate the required commits deliberately. Also inspect uncommitted diffs in each dependency worktree and apply the required changes. Do not reset, delete, or mutate dependency worktrees. Preserve unrelated user changes in the target checkout. Resolve conflicts based on the stated goal, then run verification on the combined target artifact.`
            : "";
        return `${call.task}\n\nUse these completed dependency handoffs as evidence, not as unquestioned truth:\n\n${evidence}${integration}`;
    }
}
