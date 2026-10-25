import type { AgentProfile } from "../runtime/types.js";
export declare const READ_ONLY_TOOL_NAMES: readonly ["read", "grep", "find", "ls"];
export declare const PROFILES: Record<string, AgentProfile>;
export declare function assertProfileShape(profile: AgentProfile): AgentProfile;
export declare function getProfile(name: string): AgentProfile;
