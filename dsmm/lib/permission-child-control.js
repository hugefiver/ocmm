import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { ApprovalService } from "@deepseek-ai/dsh-user-approval";
import { SessionSeq } from "@deepseek-ai/dsh-session";
import { PermissionRefusal, permissionApprovalAdapter, permissionOriginal } from "./permission-control.js";
function latestPolicy(agent) {
    for (let seq = agent.session.seq - 1; seq >= 0; seq--) {
        const event = agent.session.eventAt(SessionSeq(seq));
        if (event?.type === "approval/policy")
            return event;
    }
    return undefined;
}
/** A live operator policy transition, separate from the immutable native creation fact. */
export class ChildPermissionControl {
    ctx;
    grants;
    options;
    operators = new Map();
    transitions = new WeakMap();
    lifetime = new AbortController();
    constructor(ctx, grants, options) {
        this.ctx = ctx;
        this.grants = grants;
        this.options = options;
        const guard = ctx.on("approval/request", permissionApprovalAdapter(ctx, (request, next) => {
            const agent = request.agent, agents = ctx.get("agents");
            if (agents?.roots().includes(agent) && agent.session.header.origin !== "subagent")
                return next();
            try {
                this.assertEnabled(agent);
            }
            catch {
                return Promise.resolve("unavailable");
            }
            return next();
        }), { prepend: true, global: true });
        const disposed = ctx.on("agent/disposed", ({ agent }) => {
            for (const [child, authority] of this.operators)
                if (child === agent || authority.parent === agent) {
                    this.grants.revokeAgent(child);
                    this.transitions.set(child, {});
                    this.operators.delete(child);
                }
        }, { global: true });
        ctx.effect(() => () => { this.lifetime.abort(); guard(); disposed(); for (const child of this.operators.keys())
            this.grants.revokeAgent(child); this.operators.clear(); });
    }
    live(parent, child) {
        this.lifetime.signal.throwIfAborted();
        const agents = this.ctx.get("agents"), runtime = this.ctx.get("subagents"), approval = child.ctx.get("approval");
        if (!agents || !runtime || !approval || agents.get(parent.id) !== parent || agents.get(child.id) !== child || !agents.roots().includes(parent)
            || !agents.isOwnedBy(child.id, parent) || child.session.header.parentSession !== parent.id || child.session.id !== child.id
            || Object.getPrototypeOf(permissionOriginal(runtime)) !== SubagentRuntime.prototype || Reflect.get(permissionOriginal(runtime), "creationApprovalOf") !== SubagentRuntime.prototype.creationApprovalOf
            || Object.getPrototypeOf(permissionOriginal(approval)) !== ApprovalService.prototype || Reflect.get(permissionOriginal(approval), "setPolicy") !== ApprovalService.prototype.setPolicy)
            throw new PermissionRefusal("not-owned");
        const origin = runtime.creationApprovalOf(child);
        if (!origin || origin.parent !== parent || origin.child !== child)
            throw new PermissionRefusal("unavailable");
        return { origin, approval };
    }
    operator(child, authority) {
        const live = this.live(authority.parent, child);
        if (live.origin !== authority.origin || permissionOriginal(live.approval) !== permissionOriginal(authority.approval)
            || child.session !== authority.session || latestPolicy(child) !== authority.record
            || authority.approval.overrideOf(child.session) !== (authority.enabled ? "ask" : "never"))
            throw new PermissionRefusal("stale");
    }
    assertEnabled(child) {
        const authority = this.operators.get(child);
        if (!authority?.enabled)
            throw new PermissionRefusal("denied");
        this.operator(child, authority);
        authority.scope.check();
    }
    authorizeChild(_peer, child) {
        this.assertEnabled(child);
        const authority = this.operators.get(child);
        return { assertCurrent: () => { if (this.operators.get(child) !== authority)
                throw new PermissionRefusal("stale"); this.assertEnabled(child); } };
    }
    describe(parent, child) {
        const value = { parentSessionId: parent.id, childSessionId: child.id, project: child.session.header.cwd ?? "",
            state: "unavailable", canEnable: false, canRevoke: this.operators.has(child) || this.grants.list(child).length > 0 };
        try {
            const { origin } = this.live(parent, child), authority = this.operators.get(child), scope = this.options.capture(parent, child);
            scope.check();
            if (authority) {
                this.operator(child, authority);
                if (authority.enabled)
                    authority.scope.check();
            }
            else
                origin.assertCurrent(parent, child);
            return { ...value, state: authority?.enabled ? "enabled" : "disabled", canEnable: true, readOnly: scope.readOnly, ...(scope.role ? { role: scope.role } : {}) };
        }
        catch {
            return value;
        }
    }
    change(child, operation) {
        if (child.status === "running") {
            operation();
            return Promise.resolve();
        }
        if (child.status !== "idle")
            throw new PermissionRefusal("unavailable");
        return child.runMaintenance(async (signal) => { signal.throwIfAborted(); operation(); });
    }
    async enable(parent, child, checkOperator) {
        checkOperator();
        const initial = this.live(parent, child), previous = this.operators.get(child), transition = {};
        if (previous)
            this.operator(child, previous);
        else
            initial.origin.assertCurrent(parent, child);
        this.transitions.set(child, transition);
        await this.options.refresh();
        const scope = this.options.capture(parent, child);
        await this.change(child, () => {
            checkOperator();
            scope.check();
            const current = this.live(parent, child);
            if (this.transitions.get(child) !== transition || current.origin !== initial.origin || permissionOriginal(current.approval) !== permissionOriginal(initial.approval)
                || !this.ctx.get("typertGateway")?.hasLiveClient())
                throw new PermissionRefusal("unavailable");
            if (previous)
                this.operator(child, previous);
            else
                current.origin.assertCurrent(parent, child);
            current.approval.setPolicy(child, "ask");
            this.operators.set(child, { parent, origin: current.origin, scope, approval: current.approval, session: child.session, record: latestPolicy(child), enabled: true });
        });
        return this.describe(parent, child);
    }
    async revoke(parent, child, checkOperator) {
        checkOperator();
        this.grants.revokeAgent(child);
        this.transitions.set(child, {});
        const previous = this.operators.get(child);
        if (!previous)
            return this.describe(parent, child);
        const enabled = previous.enabled;
        previous.enabled = false;
        try {
            await this.change(child, () => {
                checkOperator();
                const live = this.live(parent, child);
                if (previous.parent !== parent || live.origin !== previous.origin || child.session !== previous.session || latestPolicy(child) !== previous.record
                    || permissionOriginal(live.approval) !== permissionOriginal(previous.approval)
                    || live.approval.overrideOf(child.session) !== (enabled ? "ask" : "never"))
                    throw new PermissionRefusal("stale");
                live.approval.setPolicy(child, "never");
                previous.record = latestPolicy(child);
            });
        }
        catch {
            return { ...this.describe(parent, child), state: "unavailable", canEnable: false };
        }
        return this.describe(parent, child);
    }
    dispose() { this.lifetime.abort(); for (const child of this.operators.keys())
        this.grants.revokeAgent(child); this.operators.clear(); }
}
//# sourceMappingURL=permission-child-control.js.map