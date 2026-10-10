import type { AgentProfile, IsolationMode } from "../runtime/types.ts";

/** Apply at both record creation and execution so persisted or recovered records cannot bypass it. */
export function assertCompatibleIsolation(profile: Pick<AgentProfile, "name" | "writable">, isolation: IsolationMode): void {
  if (profile.writable && isolation === "readonly") {
    throw new Error(`Writable profile ${profile.name} cannot use readonly isolation.`);
  }
  if (profile.name === "integrator" && isolation !== "shared") {
    throw new Error("Integrator must use shared isolation in the target checkout.");
  }
}
