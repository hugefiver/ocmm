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
import { symbols } from "@deepseek-ai/cordis";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { Remote, RemoteError, TypertRemoteService, remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { scopeLifetime } from "./lifetime.js";
import { runtimeAdmissionView } from "./runtime-integration.js";
import { invocationView } from "./role-invocation.js";
import { roleRouteComparison } from "./role-subagents.js";
import { ROLE_CONTROL_HOST, parseChildSessionSnapshot, parseRoleControlDescendants, parseRoleControlPromptRequest, parseRoleControlInterruptRequest, parseRoleControlSessionId } from "./role-control-remote.js";
const unavailable = { enabled: false, reason: "unavailable" };
class ControlRefusal extends Error {
    code;
    field;
    reason;
    constructor(code, field, reason) {
        super("Native child control refused");
        this.code = code;
        this.field = field;
        this.reason = reason;
    }
}
const disabled = (reason) => ({ enabled: false, reason: reason ?? "unavailable" });
function boundedLabel(label) {
    const last = label.charCodeAt(119), next = label.charCodeAt(120);
    const bounded = label.slice(0, last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 119 : 120).replace(/[\u0000-\u001f\u007f]/gu, " ");
    return new TextDecoder().decode(new TextEncoder().encode(bounded));
}
/** Authenticated projection of the native catalog. Listing never wakes a session. */
let DsmmChildrenHost = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _descendants_decorators;
    let _prompt_decorators;
    let _interrupt_decorators;
    return class DsmmChildrenHost extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _descendants_decorators = [Remote];
            _prompt_decorators = [Remote];
            _interrupt_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _descendants_decorators, { kind: "method", name: "descendants", static: false, private: false, access: { has: obj => "descendants" in obj, get: obj => obj.descendants }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prompt_decorators, { kind: "method", name: "prompt", static: false, private: false, access: { has: obj => "prompt" in obj, get: obj => obj.prompt }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _interrupt_decorators, { kind: "method", name: "interrupt", static: false, private: false, access: { has: obj => "interrupt" in obj, get: obj => obj.interrupt }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        admission = __runInitializers(this, _instanceExtraInitializers);
        lifetime = new AbortController();
        constructor(ctx, admission) {
            super(ctx, "dsmmChildren");
            this.admission = admission;
            scopeLifetime(ctx, "dsmm: retire child controls", () => this.lifetime.abort());
        }
        async scoped(id, operation) {
            let operationSignal;
            try {
                const sessionId = parseRoleControlSessionId(id), invocation = this.ctx.invocation;
                const connection = this.ctx.get("connection");
                if (!invocation?.peer || connection?.browserPeer !== invocation.peer)
                    throw new ControlRefusal("not-owned");
                const owner = Reflect.get(connection, symbols.original) ?? connection;
                const agents = this.ctx.get("agents");
                if (!agents)
                    throw new ControlRefusal("unavailable");
                const parent = agents.get(SessionId(sessionId));
                if (!parent)
                    throw new ControlRefusal("not-found", "sessionId");
                if (!agents.roots().includes(parent) || parent.session.header.origin === "subagent" || parent.session.id !== parent.id)
                    throw new ControlRefusal("not-owned", "sessionId");
                const captured = this.admission.assert(parent);
                const signal = AbortSignal.any([invocation.signal, invocation.peer.signal, this.lifetime.signal, this.admission.lifetime.signal]);
                operationSignal = signal;
                const check = () => {
                    signal.throwIfAborted();
                    const current = this.ctx.get("connection");
                    if (!current || (Reflect.get(current, symbols.original) ?? current) !== owner || current.browserPeer !== invocation.peer
                        || this.admission.assert(parent) !== captured || agents.get(parent.id) !== parent)
                        throw new ControlRefusal("not-owned", "sessionId");
                };
                check();
                return await operation({ parent, epoch: captured.epoch, signal, check });
            }
            catch (error) {
                let info;
                if (operationSignal?.aborted)
                    info = { code: "cancelled" };
                else if (error instanceof ControlRefusal)
                    info = { code: error.code, ...(error.field === undefined ? {} : { field: error.field }), ...(error.reason === undefined ? {} : { reason: error.reason }) };
                else if (error instanceof TypeError)
                    info = { code: "validation", field: "request" };
                else {
                    const code = remoteErrorOf(error)?.code ?? (error instanceof SubagentError ? error.code : undefined);
                    if (code === "ABORTED" || code === "gateway/cancelled" || error instanceof Error && error.name === "AbortError")
                        info = { code: "cancelled" };
                    else if (code === "UNAUTHORIZED" || code === "subagent/unauthorized")
                        info = { code: "not-owned" };
                    else if (code === "NOT_RESUMABLE" || code === "subagent/not-resumable")
                        info = { code: "not-resumable", field: "childSessionId" };
                    else if (code === "subagent/attachment-invalid" || code === "gateway/bad-request")
                        info = { code: "invalid-content", field: "content" };
                    else if (code === "subagent/invalid-time-zone")
                        info = { code: "invalid-time-zone", field: "clientTimeZone" };
                    else
                        info = { code: "unavailable" };
                }
                throw new RemoteError("dsmm-children/refused", "The Host refused the native child control operation.", info);
            }
        }
        capabilities(scope) {
            scope.check();
            const runtime = runtimeAdmissionView(this.ctx), settings = this.admission.assert(scope.parent).settings;
            const control = !runtime.deliveryFenceReady || this.ctx.get("subagents") === undefined ? unavailable
                : !settings.modules.deepwork.enabled ? disabled("module-off") : { enabled: true };
            return { prompt: control, interrupt: control, images: control.enabled && this.ctx.get("attachments") !== undefined ? control : unavailable, runtime };
        }
        child(scope, entry, parentId = scope.parent.id) {
            scope.check();
            const child = this.ctx.get("agents")?.get(entry.id), direct = parentId === scope.parent.id;
            const live = child && this.admission.get(child), invocation = child && this.admission.invocation(child);
            const available = this.capabilities(scope);
            const reason = !direct ? "not-direct-child" : entry.mode !== "continuable" ? entry.mode === "one-shot" ? "one-shot" : "unknown-mode" : !live || !child ? "evidence-unavailable" : undefined;
            const control = reason !== undefined ? disabled(reason) : !this.ctx.get("agents")?.isOwnedBy(child.id, scope.parent) ? disabled("not-direct-child") : available.prompt;
            return { id: entry.id, parentSessionId: parentId, mode: entry.mode === "external" ? "unknown" : entry.mode, activity: child?.status === "running" ? "running" : "inactive",
                readonly: !control.enabled, controls: { prompt: control, interrupt: control }, ...(entry.label === undefined ? {} : { label: boundedLabel(entry.label) }),
                ...(invocation === undefined ? {} : { invocation: invocationView(invocation, boundedLabel(entry.label ?? invocation.target), "continuable", { childId: entry.id }) }),
                ...(child === undefined ? {} : { routeComparison: roleRouteComparison(child) }) };
        }
        describe(sessionId) {
            return this.scoped(sessionId, async (scope) => {
                const rows = await this.ctx.get("subagents").listChildren(scope.parent.id, scope.signal);
                scope.check();
                return parseChildSessionSnapshot({ sessionId, admissionEpoch: scope.epoch, children: rows.map(row => this.child(scope, row)), capabilities: this.capabilities(scope) });
            });
        }
        descendants(sessionId) {
            return this.scoped(sessionId, async (scope) => {
                const rows = await this.ctx.get("subagents").listDescendants(scope.parent.id, scope.signal);
                scope.check();
                return parseRoleControlDescendants({ sessionId, admissionEpoch: scope.epoch, descendants: rows.map(row => row.kind === "diagnostic"
                        ? { kind: "diagnostic", id: row.id, parentSessionId: row.parentId, depth: row.depth, reason: row.reason }
                        : { kind: "child", depth: row.depth, hasChildren: row.hasChildren, child: { ...this.child(scope, row, row.parentId), readonly: true, controls: { prompt: disabled("not-direct-child"), interrupt: disabled("not-direct-child") } } }) });
            });
        }
        direct(scope, childId) {
            scope.check();
            const child = this.ctx.get("agents")?.get(SessionId(childId));
            if (!child)
                throw new ControlRefusal("not-resumable", "childSessionId", "evidence-unavailable");
            if (!this.ctx.get("agents")?.isOwnedBy(child.id, scope.parent))
                throw new ControlRefusal("not-owned", "childSessionId");
            this.admission.assert(child);
            return child;
        }
        prompt(sessionId, input) {
            return this.scoped(sessionId, async (scope) => {
                const request = parseRoleControlPromptRequest(input);
                if (request.parentSessionId !== sessionId)
                    throw new ControlRefusal("validation", "parentSessionId");
                const capabilities = this.capabilities(scope);
                if (!capabilities.prompt.enabled)
                    throw new ControlRefusal("disabled", undefined, capabilities.prompt.reason);
                if (request.content.some(part => part.type === "image") && !capabilities.images.enabled)
                    throw new ControlRefusal("disabled", "content", capabilities.images.reason);
                this.direct(scope, request.childSessionId);
                return this.ctx.get("subagents").prompt(request, scope.signal);
            });
        }
        interrupt(sessionId, input) {
            return this.scoped(sessionId, async (scope) => {
                const request = parseRoleControlInterruptRequest(input);
                if (request.parentSessionId !== sessionId)
                    throw new ControlRefusal("validation", "parentSessionId");
                const capabilities = this.capabilities(scope);
                if (!capabilities.interrupt.enabled)
                    throw new ControlRefusal("disabled", undefined, capabilities.interrupt.reason);
                this.direct(scope, request.childSessionId);
                return this.ctx.get("subagents").interruptByParent(SessionId(request.childSessionId), scope.parent.id, "continuable");
            });
        }
    };
})();
export { DsmmChildrenHost };
export function registerRoleControlRpc(ctx, admission) {
    const host = new DsmmChildrenHost(ctx, admission);
    ctx.typert.register(ROLE_CONTROL_HOST);
    return host;
}
//# sourceMappingURL=role-control-rpc.js.map