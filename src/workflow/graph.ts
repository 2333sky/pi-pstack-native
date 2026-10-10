import type { WorkflowNodeSpec } from "../runtime/types.ts";

export function validateGraph(nodes: WorkflowNodeSpec[]): void {
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("Workflow requires at least one node.");
  const keys = new Set<string>();
  for (const node of nodes) {
    if (!node.key || ['__proto__','constructor','prototype'].includes(node.key) || !/^[a-zA-Z0-9._-]+$/.test(node.key)) throw new Error(`Invalid workflow node key: ${node.key || "(empty)"}`);
    if (keys.has(node.key)) throw new Error(`Duplicate workflow node key: ${node.key}`);
    keys.add(node.key);
    if (!node.task?.trim()) throw new Error(`Workflow node ${node.key} has no task.`);
  }
  for (const node of nodes) {
    for (const dep of node.dependsOn ?? []) {
      if (!keys.has(dep)) throw new Error(`Workflow node ${node.key} depends on unknown node ${dep}.`);
      if (dep === node.key) throw new Error(`Workflow node ${node.key} cannot depend on itself.`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`Workflow contains a dependency cycle at ${key}.`);
    visiting.add(key);
    for (const dep of byKey.get(key)?.dependsOn ?? []) visit(dep);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of keys) visit(key);
}

export function chainNodes(tasks: Array<Omit<WorkflowNodeSpec, "dependsOn">>): WorkflowNodeSpec[] {
  return tasks.map((task, index) => ({ ...task, dependsOn: index === 0 ? [] : [tasks[index - 1]!.key] }));
}

export function dependencyEdges(nodes: WorkflowNodeSpec[]): Array<{ from: string; to: string }> {
  return nodes.flatMap((node) => (node.dependsOn ?? []).map((dep) => ({ from: dep, to: node.key })));
}

export function downstreamKeys(nodes: Record<string, { dependsOn: string[] }>, root: string): Set<string> {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, node] of Object.entries(nodes)) {
      if (key === root || result.has(key)) continue;
      if (node.dependsOn.some((dep) => dep === root || result.has(dep))) {
        result.add(key); changed = true;
      }
    }
  }
  return result;
}
