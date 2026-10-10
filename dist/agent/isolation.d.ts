import type { AgentProfile, IsolationMode } from "../runtime/types.js";
/** Apply at both record creation and execution so persisted or recovered records cannot bypass it. */
export declare function assertCompatibleIsolation(profile: Pick<AgentProfile, "name" | "writable">, isolation: IsolationMode): void;
