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
import { Remote, RemoteError, TypertRemoteService, remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { SessionId } from "@deepseek-ai/dsh-session";
import { TYPERT_HOST } from "./profile-remote.js";
import { DsmmProfileError, profileErrorInfo } from "./profiles.js";
/** Business service addressed only by native Typert Gateway invocations. */
let DsmmProfilesHost = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _read_decorators;
    let _save_decorators;
    let _select_decorators;
    let _describeSession_decorators;
    let _selectSession_decorators;
    let _selectMode_decorators;
    return class DsmmProfilesHost extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _read_decorators = [Remote];
            _save_decorators = [Remote];
            _select_decorators = [Remote];
            _describeSession_decorators = [Remote];
            _selectSession_decorators = [Remote];
            _selectMode_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _read_decorators, { kind: "method", name: "read", static: false, private: false, access: { has: obj => "read" in obj, get: obj => obj.read }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _save_decorators, { kind: "method", name: "save", static: false, private: false, access: { has: obj => "save" in obj, get: obj => obj.save }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _select_decorators, { kind: "method", name: "select", static: false, private: false, access: { has: obj => "select" in obj, get: obj => obj.select }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _describeSession_decorators, { kind: "method", name: "describeSession", static: false, private: false, access: { has: obj => "describeSession" in obj, get: obj => obj.describeSession }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _selectSession_decorators, { kind: "method", name: "selectSession", static: false, private: false, access: { has: obj => "selectSession" in obj, get: obj => obj.selectSession }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _selectMode_decorators, { kind: "method", name: "selectMode", static: false, private: false, access: { has: obj => "selectMode" in obj, get: obj => obj.selectMode }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        backend = __runInitializers(this, _instanceExtraInitializers);
        lifetime = new AbortController();
        constructor(ctx, backend) {
            super(ctx, "dsmmProfiles");
            this.backend = backend;
            ctx.effect(() => () => this.lifetime.abort(), "dsmmProfiles: cancel scoped operations");
        }
        async invoke(operation) {
            const invocation = this.ctx.invocation;
            if (invocation === undefined || invocation.peer === undefined) {
                throw new RemoteError("dsmm-profiles/peer-required", "Use Deepwork Profiles through the native Host connection.", {});
            }
            invocation.signal.throwIfAborted();
            try {
                return await operation();
            }
            catch (error) {
                throw new RemoteError("dsmm-profiles/refused", "The Host refused the profile operation.", profileErrorInfo(error));
            }
        }
        describe() { return this.invoke(() => this.backend.describe()); }
        read(id) { return this.invoke(() => this.backend.read(id)); }
        save(request) { return this.invoke(() => this.backend.save(request)); }
        select(request) { return this.invoke(() => this.backend.select(request)); }
        /** Native Connection's exact operator is authority, not a claimed Peer ID. */
        async invokeSession(sessionId, operation, readOnly = false) {
            return this.invoke(async () => {
                const invocation = this.ctx.invocation;
                const connection = this.ctx.get("connection");
                if (connection === undefined || connection.operator !== invocation.peer) {
                    throw new DsmmProfileError("not-owned", "The native Host operator must own this session profile operation.");
                }
                // Cordis rebinds Service projections for each accessing Context. Its
                // public original symbol identifies the exact native authority owner.
                const connectionOwner = Reflect.get(connection, symbols.original) ?? connection;
                const signal = AbortSignal.any([invocation.signal, this.lifetime.signal]);
                const checkAuthority = () => {
                    if (signal.aborted)
                        throw new DsmmProfileError("cancelled", "The session profile operation was cancelled; no late selection is allowed.");
                    const currentConnection = this.ctx.get("connection");
                    const currentOwner = currentConnection === undefined ? undefined : Reflect.get(currentConnection, symbols.original) ?? currentConnection;
                    if (currentOwner !== connectionOwner || currentConnection?.operator !== invocation.peer) {
                        throw new DsmmProfileError("not-owned", "The native Host operator connection is no longer active.");
                    }
                    const agents = this.ctx.get("agents");
                    if (agents === undefined || typeof agents.get !== "function" || typeof agents.roots !== "function" || typeof agents.list !== "function" || typeof agents.isOwnedBy !== "function") {
                        throw new DsmmProfileError("unavailable", "Native session authority is unavailable.");
                    }
                    return agents;
                };
                let agents = checkAuthority();
                let captured = agents.get(sessionId);
                if (captured === undefined) {
                    // Gateway lookups run before invocation authentication. Resolve here,
                    // after full strict JSON decoding and operator admission, so invalid or
                    // unauthorized calls cannot cold-resume a native session as a side effect.
                    const controller = this.ctx.get("sessionController");
                    if (controller === undefined || typeof controller.resolveAgent !== "function") {
                        throw new DsmmProfileError("unavailable", "The native ordinary-session resume service is unavailable.");
                    }
                    let found;
                    try {
                        found = await controller.resolveAgent(SessionId(sessionId));
                    }
                    catch {
                        checkAuthority();
                        throw new DsmmProfileError("unavailable", "The native session could not be safely resumed.", "sessionId");
                    }
                    agents = checkAuthority();
                    if ("error" in found) {
                        const code = remoteErrorOf(found.error)?.code;
                        if (code === "session/not-found")
                            throw new DsmmProfileError("not-found", "The native session was not found.", "sessionId");
                        if (code === "session/agent-busy")
                            throw new DsmmProfileError("not-owned", "Subagent-owned sessions cannot select a root profile.", "sessionId");
                        if (code === "session/writer-held")
                            throw new DsmmProfileError("busy", "The native session is owned by another active writer.", "sessionId");
                        throw new DsmmProfileError("unavailable", "The native session could not be safely resumed.", "sessionId");
                    }
                    captured = found.agent;
                }
                const agent = captured;
                const checkCaptured = () => {
                    const current = checkAuthority();
                    if (agent.id !== sessionId || agent.session.id !== sessionId || current.get(sessionId) !== agent
                        || agent.session.header?.origin === "subagent" || !current.roots().includes(agent)
                        || current.list().some((owner) => owner !== agent && current.isOwnedBy(sessionId, owner))) {
                        throw new DsmmProfileError("not-owned", "Only an exact live ordinary root session can select a profile.", "sessionId");
                    }
                };
                checkCaptured();
                const result = await operation(agent, signal, checkCaptured);
                // Mutation owns its final pre-commit fence in native maintenance. A
                // successful durable commit must not be relabeled as a failed write if
                // a queued wake/disposal wins immediately after maintenance releases.
                if (readOnly)
                    checkCaptured();
                return result;
            });
        }
        describeSession(sessionId) {
            return this.invokeSession(sessionId, (agent) => this.backend.getSession(agent), true);
        }
        selectSession(sessionId, request) {
            // The redundant stable identity is a fence, never an authority assertion.
            // Check it before any native resume or profile-store operation.
            if (request.sessionId !== sessionId) {
                return this.invoke(async () => { throw new DsmmProfileError("validation", "The requested session identities must match.", "sessionId"); });
            }
            return this.invokeSession(sessionId, (agent, signal, assertAuthority) => this.backend.selectSession(request, agent, signal, assertAuthority));
        }
        selectMode(sessionId, request) {
            if (request.sessionId !== sessionId) {
                return this.invoke(async () => { throw new DsmmProfileError("validation", "The requested session identities must match.", "sessionId"); });
            }
            return this.invokeSession(sessionId, (agent, signal, assertAuthority) => {
                if (this.backend.selectMode === undefined)
                    throw new DsmmProfileError("unavailable", "Session mode selection is unavailable.");
                return this.backend.selectMode(request, agent, signal, assertAuthority);
            });
        }
    };
})();
export { DsmmProfilesHost };
/** The caller supplies the owned injection fiber; withdrawal stays native. */
export function registerProfilesRpc(ctx, backend) {
    const service = new DsmmProfilesHost(ctx, backend);
    ctx.typert.register(TYPERT_HOST);
    return service;
}
//# sourceMappingURL=profile-rpc.js.map