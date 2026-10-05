import type { DshAgent, DshContext, DshSessionEvent } from "./dsh-types.js";
import type { SessionDeepworkState } from "./profile-types.js";
export declare const DEEPWORK_MODE_EVENT = "deepwork/mode";
export type DeepworkSelectionOutcome = "committed" | "pending" | "unchanged";
export declare function isDeepworkActive(events?: readonly DshSessionEvent[], defaultActive?: boolean, selectedPreset?: string): boolean;
export declare function hasOpenTurn(events?: readonly DshSessionEvent[]): boolean;
export declare class DeepworkModeController {
    private readonly ctx;
    private readonly pending;
    constructor(ctx: DshContext);
    active(agent: DshAgent | undefined, defaultActive: boolean): boolean;
    describe(agent: DshAgent, defaultActive: boolean): SessionDeepworkState;
    select(agent: DshAgent, active: boolean, defaultActive?: boolean): Promise<DeepworkSelectionOutcome>;
    /** Native idle maintenance owns this write; never stage an uncommitted UI intent. */
    selectIdle(agent: DshAgent, active: boolean, defaultActive: boolean): Promise<void>;
    private commit;
}
//# sourceMappingURL=state.d.ts.map