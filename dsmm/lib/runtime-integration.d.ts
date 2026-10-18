import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntimeAdmissionView } from "./profile-types.js";
export type DsmmHostStartupOptions = Readonly<Record<string, never>>;
export declare function assertSupportedHostStartup(options: DsmmHostStartupOptions): void;
export declare function classifyDsmmAgent(agent: Agent): "dsmm" | "native";
export declare function runtimeAdmissionView(ctx: Context): SubagentRuntimeAdmissionView;
//# sourceMappingURL=runtime-integration.d.ts.map