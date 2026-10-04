import type { DshAgent, DshContext, DshSessionEvent } from "./dsh-types.js";
export declare const DEEPWORK_MODE_EVENT = "deepwork/mode";
export type DeepworkSelectionOutcome = "committed" | "pending" | "unchanged";
export declare function isDeepworkActive(events?: readonly DshSessionEvent[], defaultActive?: boolean): boolean;
export declare function hasOpenTurn(events?: readonly DshSessionEvent[]): boolean;
export declare class DeepworkModeController {
    private readonly ctx;
    private readonly pending;
    constructor(ctx: DshContext);
    active(agent: DshAgent | undefined, defaultActive: boolean): boolean;
    select(agent: DshAgent, active: boolean, defaultActive?: boolean): Promise<DeepworkSelectionOutcome>;
    private commit;
}
//# sourceMappingURL=state.d.ts.map