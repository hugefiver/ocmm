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
import { SessionId } from "@deepseek-ai/dsh-session";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { PermissionRefusal, permissionOriginal } from "./permission-control.js";
import { PERMISSION_HOST, parsePermissionSessionId } from "./permission-remote.js";
import { parsePermissionRulesSave } from "./permission-rules.js";
/** Root controls are ordinary Core controls; no DW delivery fence/ticket is consulted. */
let DsmmPermissionsHost = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describeRules_decorators;
    let _saveRules_decorators;
    return class DsmmPermissionsHost extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describeRules_decorators = [Remote];
            _saveRules_decorators = [Remote];
            __esDecorate(this, null, _describeRules_decorators, { kind: "method", name: "describeRules", static: false, private: false, access: { has: obj => "describeRules" in obj, get: obj => obj.describeRules }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _saveRules_decorators, { kind: "method", name: "saveRules", static: false, private: false, access: { has: obj => "saveRules" in obj, get: obj => obj.saveRules }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        rules = __runInitializers(this, _instanceExtraInitializers);
        lifetime = new AbortController();
        constructor(ctx, rules) {
            super(ctx, "dsmmPermissions");
            this.rules = rules;
            ctx.effect(() => () => this.lifetime.abort());
        }
        invoke(sessionId, operation) {
            return Promise.resolve().then(() => {
                const id = SessionId(parsePermissionSessionId(sessionId));
                const invocation = this.ctx.invocation, connection = this.ctx.get("connection");
                if (invocation?.peer === undefined || connection === undefined || invocation.peer !== connection.browserPeer)
                    throw new PermissionRefusal("not-owned");
                const peer = invocation.peer, owner = permissionOriginal(connection), agents = this.ctx.get("agents"), root = agents?.get(id);
                if (root === undefined)
                    throw new PermissionRefusal("not-owned");
                const signal = AbortSignal.any([invocation.signal, peer.signal, this.lifetime.signal]);
                const check = () => {
                    const current = this.ctx.get("connection"), registry = this.ctx.get("agents");
                    if (signal.aborted)
                        throw new PermissionRefusal("cancelled");
                    if (current === undefined || permissionOriginal(current) !== owner || current.browserPeer !== peer || registry?.get(id) !== root
                        || root.id !== sessionId || root.session.id !== sessionId || root.session.header.origin === "subagent" || !registry.roots().includes(root)
                        || registry.list().some(agent => agent !== root && registry.isOwnedBy(id, agent)))
                        throw new PermissionRefusal("not-owned");
                };
                check();
                return operation(root, peer, signal, check);
            }).catch(error => {
                const code = error instanceof PermissionRefusal ? error.code : error instanceof TypeError ? "validation" : "unavailable";
                throw new RemoteError("dsmm-permissions/refused", "The Host refused the permission operation.", { code });
            });
        }
        rulesAuthority(root, peer, signal, check) {
            const rules = this.rules;
            const settings = this.ctx.get("settings"), webServer = this.ctx.get("webServer");
            const assertCurrent = () => {
                check();
                const currentSettings = this.ctx.get("settings"), currentWeb = this.ctx.get("webServer");
                if (settings === undefined || currentSettings === undefined || permissionOriginal(currentSettings) !== permissionOriginal(settings)
                    || currentSettings.writable !== true || webServer === undefined || currentWeb === undefined
                    || permissionOriginal(currentWeb) !== permissionOriginal(webServer) || currentWeb.host !== "127.0.0.1")
                    throw new PermissionRefusal("not-owned");
                rules.backend.assertWritable(root);
            };
            assertCurrent();
            return Object.freeze({ root, peer, signal, assertCurrent });
        }
        withCapabilities(root, result) {
            const controller = this.ctx.get("dsmmPermissionController");
            let capabilities;
            if (controller !== undefined && permissionOriginal(controller.rules) === permissionOriginal(this.rules.runtime)) {
                try {
                    const observed = controller.capabilities(root);
                    const current = this.ctx.get("dsmmPermissionController");
                    if (current !== undefined && permissionOriginal(current) === permissionOriginal(controller))
                        capabilities = observed;
                }
                catch { /* Unavailable live authority is unknown, not an empty successful observation. */ }
            }
            return { snapshot: result.snapshot, runtime: result.runtime, ...capabilities === undefined ? {} : { capabilities } };
        }
        describeRules(sessionId) {
            return this.invoke(sessionId, async (root, peer, signal, check) => {
                const authority = this.rulesAuthority(root, peer, signal, check), snapshot = await this.rules.backend.read(authority);
                authority.assertCurrent();
                const result = this.withCapabilities(root, { snapshot, runtime: this.rules.runtime.status() });
                authority.assertCurrent();
                return result;
            });
        }
        saveRules(sessionId, request) {
            return this.invoke(sessionId, async (root, peer, signal, check) => {
                const parsed = parsePermissionRulesSave(request), authority = this.rulesAuthority(root, peer, signal, check);
                const snapshot = await this.rules.backend.read(authority);
                authority.assertCurrent();
                if (snapshot.revision !== parsed.expectedRevision)
                    throw new PermissionRefusal("stale");
                const result = await this.rules.backend.save(parsed, authority);
                authority.assertCurrent();
                const decorated = this.withCapabilities(root, result);
                authority.assertCurrent();
                return decorated;
            });
        }
    };
})();
export { DsmmPermissionsHost };
export function registerPermissionControlRpc(ctx, rules) {
    const host = new DsmmPermissionsHost(ctx, rules);
    ctx.typert.register(PERMISSION_HOST);
    return host;
}
/** Native-only mount does not construct a substitute Root ToolRuntime or scoped-memory authority. */
export function registerNativePermissionRulesRpc(ctx, backend, runtime) {
    return registerPermissionControlRpc(ctx, { backend, runtime });
}
//# sourceMappingURL=permission-rpc.js.map