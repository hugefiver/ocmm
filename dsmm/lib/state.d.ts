import type { DshAgent, DshContext, DshSessionEvent } from "./dsh-types.js";
import type { SessionDeepworkState } from "./profile-types.js";
export declare const DEEPWORK_MODE_EVENT = "deepwork/mode";
export type DeepworkSelectionOutcome = "committed" | "unchanged";
export declare function isDeepworkActive(events?: readonly DshSessionEvent[], defaultActive?: boolean, selectedPreset?: string): boolean;
export declare function hasOpenTurn(events?: readonly DshSessionEvent[]): boolean;
export declare class DeepworkModeController {
    private readonly ctx;
    private readonly listeners;
    constructor(ctx: DshContext);
    watch(listener: (agent: DshAgent) => void): () => void;
    /** Profile commits have no native session event; notify their Agent mount. */
    changed(agent: DshAgent): void;
    active(agent: DshAgent | undefined, defaultActive: boolean): boolean;
    describe(agent: DshAgent, defaultActive: boolean): SessionDeepworkState;
    select(agent: DshAgent, active: boolean, defaultActive?: boolean): Promise<DeepworkSelectionOutcome>;
    /** Called inside the existing native maintenance / admission CAS boundary. */
    selectIdle(agent: DshAgent, active: boolean, defaultActive: boolean): Promise<void>;
}
//# sourceMappingURL=state.d.ts.map