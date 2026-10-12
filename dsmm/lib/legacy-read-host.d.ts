import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { LegacyChildEvidence } from "./child-capture.js";
import type { LegacyReadHostOwner } from "./legacy-read-contracts.js";
import type { LegacyReadProxy } from "./legacy-read-proxy.js";
export { createLegacyReadHostOwner, createLegacyReadCallLease, LegacyReadUnavailable } from "./legacy-read-contracts.js";
export type * from "./legacy-read-contracts.js";
export { createLegacyReadComposition } from "./legacy-read-composition.js";
export type { LegacyReadComposition } from "./legacy-read-composition.js";
export type { LegacyReadProxy } from "./legacy-read-proxy.js";
/** Explicit startup entry only; default DSMM bootstrap never installs this composition. */
export declare function createLegacyReadHost(owner: LegacyReadHostOwner): {
    composition: import("./legacy-read-composition.js").LegacyReadComposition;
    attachChild(parent: Agent, child: Agent, evidence: LegacyChildEvidence, definition: ToolDefinition): LegacyReadProxy;
    releaseAfterChildDispose(child: Agent): Promise<void>;
    publishCheckedGeneration(): void;
    dispose(nativeDrain: () => Promise<void>): Promise<void>;
};
//# sourceMappingURL=legacy-read-host.d.ts.map