import { readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { AgentHost } from "../agent/host.js";
import { WorkflowEngine } from "../workflow/engine.js";
import { uid, transact } from "../runtime/protocol.js";
import { claimLease, renewLease, releaseLease, assertLease } from "./lease.js";
export async function runnerOnce(config) {
    if (!isAbsolute(config.agentDir) || !config.model?.includes('/') || !Array.isArray(config.workflowIds))
        throw new Error('RUNNER_REQUIRES_EXPLICIT_AGENT_DIR_MODEL_WORKFLOWS');
    const { ModelRuntime, ModelRegistry } = await import('@earendil-works/pi-coding-agent');
    const runtime = await ModelRuntime.create({ authPath: join(config.agentDir, 'auth.json'), modelsPath: join(config.agentDir, 'models.json'), allowModelNetwork: false });
    const slash = config.model.indexOf('/');
    const provider = config.model.slice(0, slash);
    const model = runtime.getModel(provider, config.model.slice(slash + 1));
    if (!model || !runtime.hasConfiguredAuth(provider)) {
        transact('runner-blocked', 'runner', 'standalone', () => ({ reason: 'AUTHENTICATION_UNAVAILABLE', workflowIds: config.workflowIds }));
        return [{ status: 'blocked', reason: 'AUTHENTICATION_UNAVAILABLE' }];
    }
    const host = new AgentHost({ agentDir: config.agentDir, modelRuntime: runtime });
    const engine = new WorkflowEngine(host);
    const output = [];
    for (const id of config.workflowIds) {
        const wf = engine.get(id);
        if (!wf || ['completed', 'failed', 'cancelled', 'paused'].includes(wf.state))
            continue;
        const owner = uid('runner');
        const lease = claimLease(id, owner);
        let lost = false;
        const timer = setInterval(() => { try {
            renewLease(lease);
        }
        catch {
            lost = true;
            void engine.pause(id);
            for (const a of host.list().filter(a => a.workflowId === id && a.state === 'running'))
                void host.stop(a.id);
        } }, 5000);
        try {
            assertLease(lease);
            const ctx = { cwd: wf.parentCwd, model, thinkingLevel: 'medium', scopedModels: [], modelRegistry: new ModelRegistry(runtime), sessionManager: { getSessionId: () => wf.parentSessionId ?? `runner-${id}`, getSessionFile: () => undefined } };
            output.push(await engine.run(id, ctx));
            assertLease(lease);
            if (lost)
                throw new Error('LEASE_LOST');
        }
        finally {
            clearInterval(timer);
            releaseLease(lease);
        }
    }
    return output;
}
export async function runService(configPath, once = false, signal) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    do {
        try {
            await runnerOnce(config);
        }
        catch (error) {
            transact('runner-error', 'runner', 'standalone', () => ({ reason: String(error) }));
        }
        if (once || signal?.aborted)
            return;
        await new Promise(resolve => { const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }; const timer = setTimeout(done, Math.max(1000, Math.min(config.pollMs ?? 5000, 30000))); signal?.addEventListener('abort', done, { once: true }); });
    } while (!signal?.aborted);
}
