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
import { scopeLifetime } from "./delivery-authority.js";
import { ROLE_CONTROL_HOST, parseChildSessionSnapshot, parseRoleControlBackgroundRequest, parseRoleControlCapabilities, parseRoleControlDescendants, parseRoleControlErrorInfo, parseRoleControlInterruptRequest, parseRoleControlPromptRequest, parseRoleControlSessionId } from "./role-control-remote.js";
import { parseDsmmInvocationView, parseDsmmRoleRouteComparison } from "./profile-remote.js";
class ControlRefusal extends Error {
    info;
    constructor(code, field, reason) {
        super("The Host refused the child control operation.");
        this.info = { code, ...(field === undefined ? {} : { field }), ...(reason === undefined ? {} : { reason }) };
    }
}
const disabled = (reason) => ({ enabled: false, reason });
function requireEnabled(value) { if (!value.enabled)
    throw new ControlRefusal("disabled", undefined, value.reason); }
function original(value) { return Reflect.get(value, symbols.original) ?? value; }
function terminalTransition(state, runId) {
    return state === "settled" ? { status: "already-settled", runId } : state === "cancelled" ? { status: "cancelled", runId } : undefined;
}
function boundedChildLabel(label) {
    const high = label.charCodeAt(119), low = label.charCodeAt(120);
    // Preserve the UTF-16 wire bound without splitting a valid native code point.
    const end = high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff ? 119 : 120;
    return label.slice(0, end).replace(/[\u0000-\u001f\u007f]/gu, " ");
}
/** Separate namespace: native inbox/jobs remain the sole execution owners. */
let DsmmChildrenHost = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _descendants_decorators;
    let _background_decorators;
    let _prompt_decorators;
    let _interrupt_decorators;
    return class DsmmChildrenHost extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _descendants_decorators = [Remote];
            _background_decorators = [Remote];
            _prompt_decorators = [Remote];
            _interrupt_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _descendants_decorators, { kind: "method", name: "descendants", static: false, private: false, access: { has: obj => "descendants" in obj, get: obj => obj.descendants }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _background_decorators, { kind: "method", name: "background", static: false, private: false, access: { has: obj => "background" in obj, get: obj => obj.background }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prompt_decorators, { kind: "method", name: "prompt", static: false, private: false, access: { has: obj => "prompt" in obj, get: obj => obj.prompt }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _interrupt_decorators, { kind: "method", name: "interrupt", static: false, private: false, access: { has: obj => "interrupt" in obj, get: obj => obj.interrupt }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        lifetime = (__runInitializers(this, _instanceExtraInitializers), new AbortController());
        backgroundJobs = new WeakMap();
        collaborators;
        constructor(ctx, collaborators) {
            super(ctx, "dsmmChildren");
            this.collaborators = collaborators;
            scopeLifetime(ctx, "dsmm.children: close scoped controls", () => this.lifetime.abort());
        }
        async invoke(operation) {
            try {
                return await operation();
            }
            catch (error) {
                let info;
                if (error instanceof ControlRefusal)
                    info = error.info;
                else {
                    const code = String(remoteErrorOf(error)?.code ?? (error instanceof SubagentError ? error.code : ""));
                    if (["gateway/cancelled", "ABORTED"].includes(code) || error instanceof Error && error.name === "AbortError")
                        info = { code: "cancelled" };
                    else if (["subagent/unauthorized", "UNAUTHORIZED"].includes(code))
                        info = { code: "not-owned" };
                    else if (["subagent/not-resumable", "NOT_RESUMABLE"].includes(code))
                        info = { code: "not-resumable", field: "childSessionId" };
                    else if (code === "subagent/attachment-invalid" || code === "gateway/bad-request")
                        info = { code: "invalid-content", field: "content" };
                    else if (code === "subagent/invalid-time-zone")
                        info = { code: "invalid-time-zone", field: "clientTimeZone" };
                    else
                        info = { code: "unavailable" };
                }
                // Do not forward SDK messages, details, causes, paths, content or secrets.
                throw new RemoteError("dsmm-children/refused", "The Host refused the child control operation.", parseRoleControlErrorInfo(info));
            }
        }
        decode(parse, value) {
            try {
                return parse(value);
            }
            catch {
                throw new ControlRefusal("validation", "request");
            }
        }
        async scoped(sessionId, readOnly, operation) {
            const invocation = this.ctx.invocation;
            const connection = this.ctx.get("connection");
            if (invocation?.peer === undefined || connection === undefined || connection.browserPeer !== invocation.peer)
                throw new ControlRefusal("not-owned");
            const connectionOwner = original(connection);
            const runtime = this.collaborators.runtime;
            if (!runtime.authority.view().deliveryFenceReady)
                throw new ControlRefusal("unavailable", undefined, "delivery-fence-unavailable");
            const browserSignal = runtime.authority.acquireBrowserSignal(this.ctx);
            const initialSignal = AbortSignal.any([invocation.signal, invocation.peer.signal, browserSignal, this.lifetime.signal]);
            const checkConnection = () => {
                if (initialSignal.aborted)
                    throw new ControlRefusal("cancelled");
                const current = this.ctx.get("connection");
                if (current === undefined || original(current) !== connectionOwner || current.browserPeer !== invocation.peer)
                    throw new ControlRefusal("not-owned");
                const bound = this.ctx.get("subagents");
                if (bound === undefined || original(bound) !== original(runtime))
                    throw new ControlRefusal("unavailable", undefined, "delivery-fence-unavailable");
            };
            checkConnection();
            const agents = this.ctx.get("agents");
            if (agents === undefined)
                throw new ControlRefusal("unavailable");
            let parent = agents.get(SessionId(sessionId));
            if (parent === undefined) {
                // Actions never wake an ordinary parent. Only an authenticated, decoded
                // read may use the public controller; Gateway parameter lookup cannot.
                if (!readOnly)
                    throw new ControlRefusal("unavailable", "sessionId");
                const controller = this.ctx.get("sessionController");
                if (controller === undefined)
                    throw new ControlRefusal("unavailable", "sessionId");
                const found = await controller.resolveAgent(SessionId(sessionId));
                checkConnection();
                if ("error" in found)
                    throw new ControlRefusal("unavailable", "sessionId");
                parent = found.agent;
            }
            const exactParent = parent;
            const checkRoot = () => {
                checkConnection();
                const current = this.ctx.get("agents");
                if (current === undefined || current.get(SessionId(sessionId)) !== exactParent || exactParent.id !== sessionId || exactParent.session.id !== sessionId
                    || exactParent.session.header.origin === "subagent" || !current.roots().includes(exactParent)
                    || current.list().some(owner => owner !== exactParent && current.isOwnedBy(SessionId(sessionId), owner)))
                    throw new ControlRefusal("not-owned", "sessionId");
            };
            checkRoot();
            const ticket = runtime.authority.acquireParentTicket(exactParent);
            const signal = AbortSignal.any([initialSignal, ticket.signal]);
            const scope = { parent: exactParent, ticket, signal, check() {
                    if (signal.aborted)
                        throw new ControlRefusal("cancelled");
                    checkRoot();
                    runtime.authority.assertTicket(ticket);
                } };
            scope.check();
            let result;
            try {
                result = await operation(scope);
            }
            catch (error) {
                if (signal.aborted)
                    throw new ControlRefusal("cancelled");
                throw error;
            }
            // Native acceptance/handoff owns the write cutoff. Never turn a committed
            // receipt into a failure, rollback accepted work or automatically retry.
            if (readOnly)
                scope.check();
            return result;
        }
        capabilities(scope) {
            scope.check();
            const view = parseRoleControlCapabilities(this.collaborators.capabilities(scope.ticket));
            const runtime = this.collaborators.runtime.authority.view();
            scope.check();
            return { ...view, runtime };
        }
        async childView(scope, entry, parentSessionId = scope.parent.id) {
            scope.check();
            const direct = parentSessionId === scope.parent.id;
            const inactive = this.ctx.get("agents")?.get(entry.id)?.status !== "running";
            const observation = direct ? await this.collaborators.observeChild(scope.ticket, entry, scope.signal) : undefined;
            scope.check();
            const projected = observation?.invocation === undefined ? undefined : parseDsmmInvocationView(observation.invocation);
            const mode = entry.mode === "external" ? "unknown" : entry.mode === "continuable" && projected?.mode === "one-shot" ? "one-shot" : entry.mode;
            const reason = !direct ? "not-direct-child" : mode === "one-shot" ? "one-shot" : "unknown-mode";
            const global = this.capabilities(scope);
            const controls = mode === "continuable" && entry.mode === "continuable" && observation !== undefined
                ? { prompt: global.prompt.enabled ? observation.prompt : global.prompt, interrupt: global.interrupt.enabled ? observation.interrupt : global.interrupt }
                : { prompt: disabled(reason), interrupt: disabled(reason) };
            const routeComparison = observation?.routeComparison === undefined ? undefined : parseDsmmRoleRouteComparison(observation.routeComparison);
            if (projected?.childId !== undefined && projected.childId !== entry.id)
                throw new ControlRefusal("unavailable", "childSessionId");
            if (routeComparison !== undefined && routeComparison.childId !== entry.id)
                throw new ControlRefusal("unavailable", "childSessionId");
            return { id: entry.id, parentSessionId, mode, activity: inactive ? "inactive" : "running", readonly: !controls.prompt.enabled && !controls.interrupt.enabled,
                ...(entry.label === undefined ? {} : { label: boundedChildLabel(entry.label) }), controls,
                ...(projected === undefined ? {} : { invocation: { ...projected, childId: entry.id } }),
                ...(routeComparison === undefined ? {} : { routeComparison }),
                ...(observation?.evidence === undefined ? {} : { evidence: observation.evidence }) };
        }
        async runView(scope, holder) {
            scope.check();
            const identity = holder.invocation;
            const background = identity === undefined ? disabled(holder.state === "cancelled" ? "cancelled" : "starting")
                : await this.collaborators.backgroundAvailability(scope.ticket, identity, scope.signal);
            scope.check();
            const current = holder.invocation;
            let invocation;
            if (current !== undefined) {
                const { runId: _run, childId: _child, jobId: _job, ...projected } = parseDsmmInvocationView(this.collaborators.projectRun(current));
                const jobId = this.backgroundJobs.get(holder);
                invocation = parseDsmmInvocationView({ ...projected, mode: "one-shot", runId: current.runId,
                    ...(current.childId === undefined ? {} : { childId: current.childId }), ...(jobId === undefined ? {} : { jobId }) });
            }
            const globalBackground = this.capabilities(scope).background;
            return { sessionId: holder.sessionId, toolCallId: holder.toolCallId, state: holder.state, ...(invocation === undefined ? {} : { invocation }),
                background: holder.state === "starting" ? disabled("starting") : holder.state === "settled" ? disabled("already-settled") : holder.state === "cancelled" ? disabled("cancelled")
                    : holder.state === "background" ? disabled("already-background") : globalBackground.enabled ? background : globalBackground };
        }
        describe(sessionId) {
            return this.invoke(() => this.scoped(this.decode(parseRoleControlSessionId, sessionId), true, async (scope) => {
                const catalog = await this.collaborators.runtime.listChildren(scope.parent.id, scope.signal);
                scope.check();
                const children = [], runs = [];
                for (const child of catalog)
                    children.push(await this.childView(scope, child));
                scope.check();
                for (const holder of this.collaborators.runs.list(scope.parent, scope.ticket.owner))
                    runs.push(await this.runView(scope, holder));
                scope.check();
                return parseChildSessionSnapshot({ sessionId: scope.parent.id, admissionEpoch: scope.ticket.parentEpoch, children, runs, capabilities: this.capabilities(scope) });
            }));
        }
        descendants(sessionId) {
            return this.invoke(() => this.scoped(this.decode(parseRoleControlSessionId, sessionId), true, async (scope) => {
                const catalog = await this.collaborators.runtime.listDescendants(scope.parent.id, scope.signal);
                scope.check();
                const descendants = [];
                for (const entry of catalog) {
                    scope.check();
                    if (entry.kind === "diagnostic")
                        descendants.push({ kind: "diagnostic", id: entry.id, parentSessionId: entry.parentId, depth: entry.depth, reason: entry.reason });
                    else {
                        const child = await this.childView(scope, { id: entry.id, mode: entry.mode, createdAt: 0, ...("label" in entry ? { label: entry.label } : {}) }, entry.parentId);
                        descendants.push({ kind: "child", depth: entry.depth, hasChildren: entry.hasChildren, child: { ...child, activity: entry.activity } });
                    }
                }
                return parseRoleControlDescendants({ sessionId: scope.parent.id, admissionEpoch: scope.ticket.parentEpoch, descendants });
            }));
        }
        background(sessionId, input) {
            return this.invoke(async () => {
                const request = this.decode(parseRoleControlBackgroundRequest, input);
                if (request.sessionId !== this.decode(parseRoleControlSessionId, sessionId))
                    throw new ControlRefusal("validation", "sessionId");
                return this.scoped(sessionId, false, async (scope) => {
                    if (request.expectedAdmissionEpoch !== scope.ticket.parentEpoch)
                        throw new ControlRefusal("conflict", "expectedAdmissionEpoch");
                    const holder = this.collaborators.runs.get(scope.parent, scope.ticket.owner, { sessionId: scope.parent.id,
                        toolCallId: request.toolCallId, runId: request.runId });
                    if (holder?.invocation === undefined)
                        throw new ControlRefusal("not-found", "runId");
                    const terminal = terminalTransition(holder.state, holder.invocation.runId);
                    if (terminal !== undefined) {
                        scope.check();
                        return terminal;
                    }
                    requireEnabled(this.capabilities(scope).background);
                    const permitted = await this.collaborators.backgroundAvailability(scope.ticket, holder.invocation, scope.signal);
                    scope.check();
                    // Result/cancellation may win while asynchronous capability preparation
                    // is pending. Observing that terminal state never creates a new job.
                    const observed = terminalTransition(holder.state, holder.invocation.runId);
                    if (observed !== undefined)
                        return observed;
                    requireEnabled(permitted);
                    // All async preparation is fenced before the holder's native synchronous
                    // jobs.start critical section, which rechecks its own exact authority.
                    const result = holder.background({ parent: scope.parent, owner: scope.ticket.owner, sessionId: scope.parent.id,
                        toolCallId: holder.toolCallId, runId: holder.invocation.runId, expectedAdmissionEpoch: request.expectedAdmissionEpoch });
                    if ("receipt" in result) {
                        this.backgroundJobs.set(holder, result.receipt.jobId);
                        return { status: result.status, runId: result.receipt.invocation.runId, jobId: result.receipt.jobId };
                    }
                    if (result.status === "starting")
                        throw new ControlRefusal("disabled", undefined, "starting");
                    return { status: result.status, runId: request.runId };
                });
            });
        }
        async directChild(scope, childId) {
            scope.check();
            const catalog = await this.collaborators.runtime.listChildren(scope.parent.id, scope.signal);
            scope.check();
            const child = catalog.find(child => child.id === childId);
            if (child === undefined)
                throw new ControlRefusal("not-owned", "childSessionId");
            if (child.mode !== "continuable")
                throw new ControlRefusal("not-resumable", "childSessionId");
            const view = await this.childView(scope, child);
            if (view.mode !== "continuable")
                throw new ControlRefusal("not-resumable", "childSessionId");
            return view;
        }
        prompt(sessionId, input) {
            return this.invoke(async () => {
                const request = this.decode(parseRoleControlPromptRequest, input);
                if (request.parentSessionId !== this.decode(parseRoleControlSessionId, sessionId))
                    throw new ControlRefusal("validation", "parentSessionId");
                return this.scoped(sessionId, false, async (scope) => {
                    requireEnabled(this.capabilities(scope).prompt);
                    const child = await this.directChild(scope, request.childSessionId);
                    scope.check();
                    requireEnabled(child.controls.prompt);
                    if (request.content.some(part => part.type === "image"))
                        requireEnabled(this.capabilities(scope).images);
                    scope.check();
                    // Original browser request identity, content, images, zone and delivery
                    // enter the unique C1 public override, then native pre-inbox cutoff.
                    return this.ctx.subagents.prompt(request, scope.signal);
                });
            });
        }
        interrupt(sessionId, input) {
            return this.invoke(async () => {
                const request = this.decode(parseRoleControlInterruptRequest, input);
                if (request.parentSessionId !== this.decode(parseRoleControlSessionId, sessionId))
                    throw new ControlRefusal("validation", "parentSessionId");
                return this.scoped(sessionId, false, async (scope) => {
                    requireEnabled(this.capabilities(scope).interrupt);
                    const child = await this.directChild(scope, request.childSessionId);
                    scope.check();
                    requireEnabled(child.controls.interrupt);
                    scope.check();
                    return this.ctx.subagents.interruptByParent(SessionId(request.childSessionId), scope.parent.id, "continuable");
                });
            });
        }
    };
})();
export { DsmmChildrenHost };
/** Caller supplies an owned Host injection fiber; no replacement or auto-mount. */
export function registerRoleControlRpc(ctx, collaborators) {
    const host = new DsmmChildrenHost(ctx, collaborators);
    ctx.typert.register(ROLE_CONTROL_HOST);
    return host;
}
//# sourceMappingURL=role-control-rpc.js.map