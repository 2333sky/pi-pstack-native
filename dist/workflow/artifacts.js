import { getProfile } from "../agent/profiles.js";
export const PARENT_ARTIFACT = "@parent";
/** Analyze all upstream writes, including writes hidden behind read-only synthesizers. */
export function planArtifacts(nodes) {
    const byKey = new Map(nodes.map((node) => [node.key, node]));
    const origin = new Map();
    const ancestors = new Map();
    const visiting = new Set();
    const visit = (key) => {
        if (origin.has(key))
            return;
        if (visiting.has(key))
            throw new Error(`Workflow contains a dependency cycle at ${key}`);
        visiting.add(key);
        const node = byKey.get(key);
        if (!node)
            throw new Error(`Unknown workflow node ${key}`);
        const profile = getProfile(node.profile ?? "worker");
        if (profile.writable && node.isolation === "readonly") {
            throw new Error(`Writable call ${key} cannot use readonly isolation.`);
        }
        if (profile.name === "integrator" && node.isolation && node.isolation !== "shared") {
            throw new Error(`Integrator ${key} must run in the target checkout with shared isolation.`);
        }
        const deps = node.dependsOn ?? [];
        if (profile.name === 'repro-verifier' && (node.isolation !== 'shared' || deps.length !== 1 || byKey.get(deps[0])?.profile !== 'adversary'))
            throw new Error(`Repro verifier ${key} must continue exactly one adversary worktree.`);
        const prior = new Set();
        const parents = new Set();
        for (const dep of deps) {
            visit(dep);
            for (const lane of origin.get(dep))
                prior.add(lane);
            parents.add(dep);
            for (const ancestor of ancestors.get(dep))
                parents.add(ancestor);
        }
        ancestors.set(key, parents);
        if (profile.name === "integrator") {
            // A successful integration deliberately collapses prior worktree artifacts into the parent.
            origin.set(key, new Set([PARENT_ARTIFACT]));
        }
        else if (profile.writable) {
            if (prior.size > 1) {
                throw new Error(`Writable call ${key} has multiple unmerged writable artifacts (${[...prior].join(", ")}). Use profile "integrator" for an explicit merge owner.`);
            }
            if (prior.size === 1 && !prior.has(PARENT_ARTIFACT)) {
                if (node.isolation === "worktree") {
                    throw new Error(`Writable continuation ${key} cannot fork its existing artifact using worktree isolation; add an integrator or start an independent branch.`);
                }
                origin.set(key, prior);
            }
            else {
                origin.set(key, new Set([key]));
            }
        }
        else {
            if (["reviewer", "verifier"].includes(profile.name) && prior.size > 1) {
                throw new Error(`${profile.name} call ${key} sees multiple unmerged writable artifacts (${[...prior].join(", ")}). Add an integrator node first, then verify/review the integrated checkout.`);
            }
            if (profile.name === 'cross-judge' && (deps.length < 1 || prior.size !== deps.length || deps.some(dep => {
                const candidate = byKey.get(dep);
                return (candidate.profile ?? 'worker') !== 'worker' || candidate.isolation !== 'worktree' || (candidate.dependsOn?.length ?? 0) !== 0 || origin.get(dep)?.size !== 1;
            })))
                throw new Error(`Cross-judge ${key} requires distinct root worker worktrees as direct dependencies.`);
            origin.set(key, prior);
        }
        visiting.delete(key);
    };
    for (const node of nodes)
        visit(node.key);
    const isolated = new Set();
    const writers = nodes.filter((node) => getProfile(node.profile ?? "worker").writable);
    for (let i = 0; i < writers.length; i++) {
        for (let j = i + 1; j < writers.length; j++) {
            const a = writers[i], b = writers[j];
            if (ancestors.get(a.key).has(b.key) || ancestors.get(b.key).has(a.key))
                continue;
            const aLane = [...origin.get(a.key)][0];
            const bLane = [...origin.get(b.key)][0];
            // An incomparable fork on an existing lane cannot be executed safely on the same checkout.
            if (aLane === bLane) {
                throw new Error(`Concurrent writable calls ${a.key} and ${b.key} fork the same unmerged artifact. Serialize them or add an explicit integration boundary.`);
            }
            if (aLane !== PARENT_ARTIFACT)
                isolated.add(aLane);
            if (bLane !== PARENT_ARTIFACT)
                isolated.add(bLane);
        }
    }
    // Explicit isolation must not defeat the graph's required isolation.
    for (const node of writers) {
        const profile = getProfile(node.profile ?? "worker");
        if (profile.name === "integrator")
            continue;
        const lane = [...origin.get(node.key)][0];
        if (isolated.has(lane) && node.isolation === "shared" && profile.name !== 'repro-verifier') {
            throw new Error(`Writable call ${node.key} requires a worktree: shared isolation would collide with an independent writer.`);
        }
    }
    return { origin, isolated, ancestors };
}
