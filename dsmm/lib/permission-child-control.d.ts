import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { TemporaryPermissionGrants } from "./permission-temporary-grants.js";
import type { ChildPermissionView } from "./permission-temporary-types.js";
interface ChildScope {
    readonly role?: string;
    readonly readOnly: boolean;
    check(): void;
}
export interface ChildPermissionOptions {
    capture(parent: Agent, child: Agent): ChildScope;
    refresh(): Promise<unknown>;
}
/** A live operator policy transition, separate from the immutable native creation fact. */
export declare class ChildPermissionControl {
    private readonly ctx;
    private readonly grants;
    private readonly options;
    private readonly operators;
    private readonly transitions;
    private readonly lifetime;
    constructor(ctx: Context, grants: TemporaryPermissionGrants, options: ChildPermissionOptions);
    private live;
    private operator;
    assertEnabled(child: Agent): void;
    authorizeChild(_peer: object, child: Agent): {
        assertCurrent(): void;
    };
    describe(parent: Agent, child: Agent): ChildPermissionView;
    private change;
    enable(parent: Agent, child: Agent, checkOperator: () => void): Promise<ChildPermissionView>;
    revoke(parent: Agent, child: Agent, checkOperator: () => void): Promise<ChildPermissionView>;
    dispose(): void;
}
export {};
//# sourceMappingURL=permission-child-control.d.ts.map