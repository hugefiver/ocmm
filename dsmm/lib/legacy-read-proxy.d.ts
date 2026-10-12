import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Scope } from "@deepseek-ai/dsh-scope";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { LegacyChildEvidence } from "./child-capture.js";
import type { LegacyReadComposition } from "./legacy-read-composition.js";
export interface LegacyReadProxy {
    readonly parent: Agent;
    readonly child: Agent;
    readonly definition: ToolDefinition;
    readonly nativeDefinition: ToolDefinition;
    readonly proxyScope: Scope;
    readonly standingScope: Scope;
    /** Actual registrations contributed by this adapter, for the owning Host's closed inventory. */
    readonly contributions: readonly {
        readonly stage: "pre" | "guard" | "around" | "project" | "finalization";
        readonly scope: Scope;
        readonly reference: object;
        readonly order: number;
    }[];
    /** Requires closed admission and drained leases; standing deny is retained. */
    removeProxy(): Promise<void>;
    /** Called by the Host ONLY after actual child disposal, never proxy removal. */
    releaseAfterChildDispose(): Promise<void>;
}
export declare function installLegacyReadProxy(composition: LegacyReadComposition, parent: Agent, child: Agent, evidence: LegacyChildEvidence, nativeDefinition: ToolDefinition): LegacyReadProxy;
//# sourceMappingURL=legacy-read-proxy.d.ts.map