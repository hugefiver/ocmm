import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import { DsmmRolePolicy } from "./role-policy.js";
import type { DsmmSettings, DsmmSettingsGetter, DsmmProfileAdmission, DsmmModelRoute } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
import type { DsmmInvocationView } from "./profile-types.js";
import type { ResolvedRoleInvocation } from "./role-invocation.js";
import type { RoleRunRegistry } from "./role-runs.js";
/** Keep native controls on the frozen startup substrate, not desired-save reconciliation. */
export declare function registerNativeSubagentControls(ctx: Context): Promise<void>;
/** C's same-run holder/live projection can read the actual lock without reapplying defaults. */
export declare function roleInvocationView(invocation: ResolvedRoleInvocation, label: string, mode: DsmmInvocationView["mode"], getSettings: DsmmSettingsGetter, child?: DshAgent, ids?: Pick<DsmmInvocationView, "runId" | "childId" | "jobId">): DsmmInvocationView;
/** Initial preflight/lock is not an observed SDK request; keep E's distinction truthful. */
export declare function roleInvocationObservation(invocation: ResolvedRoleInvocation, label: string, mode: DsmmInvocationView["mode"], getSettings: DsmmSettingsGetter, child?: DshAgent, ids?: Pick<DsmmInvocationView, "runId" | "childId" | "jobId">): {
    view: DsmmInvocationView;
    routeKind: "initial" | "actual";
};
export type DsmmInitialRoleRoute = {
    readonly status: "known";
    readonly source: "invocation-capture";
    readonly route: Readonly<DsmmModelRoute>;
} | {
    readonly status: "unknown";
    readonly reason: "missing-invocation-capture";
};
export type DsmmLiveRoleRoute = {
    readonly status: "known";
    readonly source: "own-native-request-header";
    readonly route: Readonly<DsmmModelRoute>;
} | {
    readonly status: "unknown";
    readonly reason: "no-own-request-header" | "invalid-own-request-header";
};
export interface DsmmRoleRouteComparison {
    readonly childId: string;
    readonly initialRoute: DsmmInitialRoleRoute;
    readonly liveRoute: DsmmLiveRoleRoute;
}
/** Both observations belong to this exact native Agent; no parent/settings/route-lock fallback. */
export declare function roleRouteComparison(child: Agent): DsmmRoleRouteComparison;
export interface DsmmRoleRunCapture {
    readonly invocation: ResolvedRoleInvocation;
    readonly admission: DsmmProfileAdmission;
}
/** Created on the parent's stable Host scope, never per profile entry or tool call. */
export interface DsmmRoleRunsBinding {
    readonly registry: RoleRunRegistry<DsmmRoleRunCapture, DsmmInvocationView>;
    readonly owner: object;
}
export interface DsmmCallableEntry {
    name: string;
    kind: "role" | "category";
    targets: readonly DsmmRoleId[];
    targetParameter?: "role" | "category";
}
/** Shared by runtime registration and the prompt assembler; empty groups have no callable entry. */
export declare function callableRoleInventory(settings: DsmmSettings, targets: readonly DsmmRoleId[]): readonly DsmmCallableEntry[];
/** Exact currently exposed definitions, suitable for E's runtime guidance and safe capability views. */
export declare function admittedCallableRoleInventory(agent: DshAgent, settings: DsmmSettings, policy: DsmmRolePolicy, tools: ToolRuntime): readonly DsmmCallableEntry[];
/** Published name retained; all native/headless Agents consume one admitted policy. */
export declare function registerHeadlessRoleTools(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter, policy?: DsmmRolePolicy, roleRuns?: DsmmRoleRunsBinding): Promise<void>;
//# sourceMappingURL=role-subagents.d.ts.map