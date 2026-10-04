import type { DshLlmFailure, DshSessionEvent } from "./dsh-types.js";
import type { DsmmRecoveryRoute, DsmmRuntimeRecoverySettings } from "./settings.js";
export type RecoveryFailureDecision = {
    kind: "retryable";
    matchedBy: "status" | "code";
} | {
    kind: "ignored";
};
export interface DurableRecoveryWork {
    incompleteTodo: boolean;
    activeGoal: boolean;
}
interface FallbackRouteSelectionInput {
    failedRoute: DsmmRecoveryRoute;
    attemptedRoutes: readonly DsmmRecoveryRoute[];
    fallbackRoutes: readonly DsmmRecoveryRoute[];
    maxFallbackAttempts: number;
}
export declare function classifyRecoveryFailure(failure: DshLlmFailure, settings: DsmmRuntimeRecoverySettings): RecoveryFailureDecision;
export declare function isCurrentRecoveryStep(events: readonly DshSessionEvent[], turn: number, step: number): boolean;
export declare function foldAttemptedRecoveryRoutes(events: readonly DshSessionEvent[], turn: number, step: number): DsmmRecoveryRoute[];
export declare function foldDurableRecoveryWork(events: readonly DshSessionEvent[]): DurableRecoveryWork;
export declare function selectFallbackRoute({ failedRoute, attemptedRoutes, fallbackRoutes, maxFallbackAttempts }: FallbackRouteSelectionInput): DsmmRecoveryRoute | undefined;
export {};
//# sourceMappingURL=recovery-policy.d.ts.map