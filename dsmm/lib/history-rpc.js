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
import { getTraceable, symbols } from "@deepseek-ai/cordis";
import { RemoteAccessService } from "@deepseek-ai/dsh-api-remote-access";
import { SessionId } from "@deepseek-ai/dsh-session";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { assertLocalSettingsOperator } from "./profile-rpc.js";
import { scopeLifetime } from "./lifetime.js";
import { HistoryContinuations, HistoryRefusal, historyFailure } from "./history-controller.js";
import { HISTORY_HOST } from "./history-remote.js";
import { historySessionId, parseHistoryConfirmRequest, parseHistoryFailure, parseHistoryPreviewRequest } from "./history-codec.js";
/** Native authenticated local-operator RPC; browser payloads carry no admission authority. */
let DsmmHistoryHost = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _choices_decorators;
    let _preview_decorators;
    let _confirm_decorators;
    return class DsmmHistoryHost extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _choices_decorators = [Remote];
            _preview_decorators = [Remote];
            _confirm_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _choices_decorators, { kind: "method", name: "choices", static: false, private: false, access: { has: obj => "choices" in obj, get: obj => obj.choices }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _preview_decorators, { kind: "method", name: "preview", static: false, private: false, access: { has: obj => "preview" in obj, get: obj => obj.preview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _confirm_decorators, { kind: "method", name: "confirm", static: false, private: false, access: { has: obj => "confirm" in obj, get: obj => obj.confirm }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        history = __runInitializers(this, _instanceExtraInitializers);
        lifetime = new AbortController();
        constructor(ctx, history) {
            super(ctx, "dsmmHistory");
            this.history = history;
            scopeLifetime(ctx, "dsmm: close history RPC", () => this.lifetime.abort());
        }
        operator() {
            try {
                assertLocalSettingsOperator(this.ctx);
            }
            catch {
                throw new HistoryRefusal("not-owned");
            }
            const ctx = this.ctx, invocation = ctx.invocation;
            const connection = ctx.get("connection");
            const owner = Reflect.get(connection, symbols.original) ?? connection;
            const peer = invocation.peer;
            const signal = AbortSignal.any([invocation.signal, peer.signal, this.lifetime.signal]);
            const assertOwner = () => {
                this.lifetime.signal.throwIfAborted();
                peer.signal.throwIfAborted();
                const current = ctx.get("connection");
                if (!current || (Reflect.get(current, symbols.original) ?? current) !== owner || current.browserPeer !== peer
                    || ctx.get("webServer")?.host !== "127.0.0.1" || ctx.get("settings")?.writable !== true)
                    throw new HistoryRefusal("not-owned");
            };
            return { peer, connection: owner, peerSignal: peer.signal, signal, assertOwner,
                assertCurrent: () => { signal.throwIfAborted(); assertOwner(); },
                assertVisible: id => {
                    assertOwner();
                    const access = ctx.get("remoteAccess");
                    if (!(access instanceof RemoteAccessService) || !access.allows({ kind: "session", id: SessionId(id) }))
                        throw new HistoryRefusal("not-owned");
                } };
        }
        async invoke(operation) {
            try {
                return await operation(getTraceable(this.ctx, this.history), this.operator());
            }
            catch (error) {
                throw new RemoteError("dsmm-history/refused", "The Host refused history continuation.", parseHistoryFailure(historyFailure(error)));
            }
        }
        describe(sessionId) { return this.invoke((history, operator) => history.describe(historySessionId(sessionId), operator)); }
        choices() { return this.invoke((history, operator) => history.choices(operator)); }
        preview(sessionId, input) {
            return this.invoke((history, operator) => {
                const request = parseHistoryPreviewRequest(input);
                if (historySessionId(sessionId) !== request.sessionId)
                    throw new HistoryRefusal("validation");
                return history.preview(request, operator);
            });
        }
        confirm(sessionId, input) {
            return this.invoke((history, operator) => {
                const request = parseHistoryConfirmRequest(input);
                if (historySessionId(sessionId) !== request.sessionId)
                    throw new HistoryRefusal("validation");
                return history.confirm(request, operator);
            });
        }
    };
})();
export { DsmmHistoryHost };
export function registerHistoryContinuationRpc(ctx, candidates, admission) {
    const history = new HistoryContinuations(ctx, candidates, admission);
    const host = new DsmmHistoryHost(ctx, history);
    ctx.typert.register(HISTORY_HOST);
    return host;
}
//# sourceMappingURL=history-rpc.js.map