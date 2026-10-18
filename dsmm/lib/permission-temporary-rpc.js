var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { SessionId } from "@deepseek-ai/dsh-session";
import { permissionOriginal } from "./permission-control.js";
import { TEMPORARY_PERMISSION_HOST, parseTemporaryDelivery, parseTemporaryDuration, parseTemporaryId } from "./permission-temporary-remote.js";
let DsmmTemporaryPermissionsHost = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _request_decorators;
    let _retain_decorators;
    let _permit_decorators;
    let _revoke_decorators;
    let _child_decorators;
    let _enableChild_decorators;
    let _revokeChild_decorators;
    return class DsmmTemporaryPermissionsHost extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _request_decorators = [Remote];
            _retain_decorators = [Remote];
            _permit_decorators = [Remote];
            _revoke_decorators = [Remote];
            _child_decorators = [Remote];
            _enableChild_decorators = [Remote];
            _revokeChild_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _request_decorators, { kind: "method", name: "request", static: false, private: false, access: { has: obj => "request" in obj, get: obj => obj.request }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _retain_decorators, { kind: "method", name: "retain", static: false, private: false, access: { has: obj => "retain" in obj, get: obj => obj.retain }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _permit_decorators, { kind: "method", name: "permit", static: false, private: false, access: { has: obj => "permit" in obj, get: obj => obj.permit }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _revoke_decorators, { kind: "method", name: "revoke", static: false, private: false, access: { has: obj => "revoke" in obj, get: obj => obj.revoke }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _child_decorators, { kind: "method", name: "child", static: false, private: false, access: { has: obj => "child" in obj, get: obj => obj.child }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _enableChild_decorators, { kind: "method", name: "enableChild", static: false, private: false, access: { has: obj => "enableChild" in obj, get: obj => obj.enableChild }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _revokeChild_decorators, { kind: "method", name: "revokeChild", static: false, private: false, access: { has: obj => "revokeChild" in obj, get: obj => obj.revokeChild }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        grants = __runInitializers(this, _instanceExtraInitializers);
        options;
        lifetime = new AbortController();
        constructor(ctx, grants, options) {
            super(ctx, "dsmmTemporaryPermissions");
            this.grants = grants;
            this.options = options;
            ctx.effect(() => () => this.lifetime.abort());
        }
        invoke(sessionId, operation) {
            try {
                const id = SessionId(parseTemporaryId(sessionId)), invocation = this.ctx.invocation;
                const connection = this.ctx.get("connection");
                const peer = invocation?.peer, registry = this.ctx.get("agents"), agent = registry?.get(id);
                if (!connection || !peer || peer !== connection.browserPeer || !agent || peer.signal.aborted || invocation.signal.aborted
                    || this.lifetime.signal.aborted)
                    throw new Error("Operator ownership unavailable.");
                if (agent.session.id !== sessionId)
                    throw new Error("Session identity mismatch.");
                if (!registry.roots().includes(agent) || agent.session.header.origin === "subagent") {
                    const child = this.options.authorizeChild?.(peer, agent) ?? this.options.children?.authorizeChild(peer, agent);
                    if (!child)
                        throw new Error("Explicit child operator authorization required.");
                    child.assertCurrent();
                }
                if (permissionOriginal(this.ctx.get("connection")) !== permissionOriginal(connection))
                    throw new Error("Connection changed.");
                return operation(agent, peer);
            }
            catch (error) {
                throw new RemoteError("dsmm-temporary-permissions/refused", "Temporary permission operation refused.", { code: error instanceof TypeError ? "validation" : "unavailable" });
            }
        }
        delivery(sessionId, input, operation) {
            const delivery = parseTemporaryDelivery(input);
            return this.invoke(sessionId, (_agent, peer) => {
                const view = this.grants.request(peer, delivery.requestId, delivery.deliveryId);
                if (view.sessionId !== sessionId)
                    throw new Error("Approval belongs to another session.");
                return operation(peer, delivery);
            });
        }
        describe(sessionId) { return this.invoke(sessionId, agent => this.grants.list(agent)); }
        request(sessionId, delivery) {
            return this.delivery(sessionId, delivery, (peer, value) => this.grants.request(peer, value.requestId, value.deliveryId));
        }
        retain(sessionId, delivery, duration, scope = "exact") {
            return this.delivery(sessionId, delivery, (peer, value) => this.grants.retain(peer, value.requestId, value.deliveryId, parseTemporaryDuration(duration), parseTemporaryId(scope)));
        }
        permit(sessionId, delivery) {
            return this.delivery(sessionId, delivery, (peer, value) => this.grants.permit(peer, value.requestId, value.deliveryId));
        }
        revoke(sessionId, grantId) { return this.invoke(sessionId, agent => this.grants.revoke(agent, parseTemporaryId(grantId))); }
        async childOperation(sessionId, childSessionId, action) {
            try {
                return await this.invoke(sessionId, (parent, peer) => {
                    const children = this.options.children, registry = this.ctx.get("agents"), child = registry?.get(SessionId(parseTemporaryId(childSessionId)));
                    const connection = permissionOriginal(this.ctx.get("connection"));
                    if (!children || !child || !registry.roots().includes(parent) || !registry.isOwnedBy(child.id, parent))
                        throw new Error("Exact direct child required.");
                    const check = () => this.invoke(sessionId, (current, currentPeer) => {
                        if (current !== parent || currentPeer !== peer || permissionOriginal(this.ctx.get("connection")) !== connection
                            || registry.get(child.id) !== child || !registry.isOwnedBy(child.id, parent))
                            throw new Error("Child operator changed.");
                    });
                    return action === "describe" ? children.describe(parent, child) : children[action](parent, child, check);
                });
            }
            catch {
                throw new RemoteError("dsmm-temporary-permissions/refused", "Child permission operation refused.", { code: "unavailable" });
            }
        }
        child(sessionId, childSessionId) { return this.childOperation(sessionId, childSessionId, "describe"); }
        enableChild(sessionId, childSessionId) { return this.childOperation(sessionId, childSessionId, "enable"); }
        revokeChild(sessionId, childSessionId) { return this.childOperation(sessionId, childSessionId, "revoke"); }
    };
})();
export { DsmmTemporaryPermissionsHost };
export function registerTemporaryPermissionRpc(ctx, grants, options = {}) {
    const host = new DsmmTemporaryPermissionsHost(ctx, grants, options);
    ctx.typert.register(TEMPORARY_PERMISSION_HOST);
    return host;
}
//# sourceMappingURL=permission-temporary-rpc.js.map