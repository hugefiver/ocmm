import type { Agent } from "@deepseek-ai/dsh-agent";
import type { LegacyChildEvidence } from "./child-capture.js";
import type { LegacyReadBindings, LegacyReadClosedSnapshot, LegacyReadCompositionLease, LegacyReadHostOwner } from "./legacy-read-contracts.js";
export interface LegacyReadComposition {
    readonly owner: LegacyReadHostOwner;
    view(): {
        state: "off" | "ready" | "closed" | "disposed";
        generation: number;
        activeCalls: number;
        reason?: string;
    };
    captureClosedComposition(): LegacyReadClosedSnapshot | undefined;
    publishGeneration(snapshot: LegacyReadClosedSnapshot, expectedGeneration: number): void;
    acquireLease(parent: Agent, child: Agent, evidence: LegacyChildEvidence, signal: AbortSignal): LegacyReadCompositionLease;
    closeForChange(reason: string): Promise<void>;
    closeForDispose(reason: string): Promise<void>;
}
export declare function createLegacyReadComposition(owner: LegacyReadHostOwner): LegacyReadComposition;
export declare function assertLegacyReadBindings(lease: LegacyReadCompositionLease, current: LegacyReadBindings): void;
//# sourceMappingURL=legacy-read-composition.d.ts.map