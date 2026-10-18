import { Context, symbols } from "@deepseek-ai/cordis";
import { LlmRuntime, LlmError, errorChain, isAgentLoopRequest, projectFilesToText, projectImagesForTextModel, projectToolUpdates } from "@deepseek-ai/dsh-llm";
import { canonicalHeader } from "@deepseek-ai/dsh-session";
import { isDeepStrictEqual } from "node:util";
import { copyRouteJson } from "./route-json.js";
import { modelRouteFromCall } from "./role-llm.js";
import { classifyDsmmAgent } from "./runtime-integration.js";
import { latestNativeModelSelection } from "./role-routing.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import { capturedRoleInvocation } from "./role-invocation.js";
export function captureDsmmEffortSource(agent) {
    const current = agent;
    const invocation = capturedRoleInvocation(current);
    if (latestNativeModelSelection(current) !== undefined
        || agent.session.header.origin !== "subagent" && !resolveSelectedAgentPreset(current.session)?.startsWith("dsmm-"))
        return "native";
    return invocation?.effortSource ?? (invocation?.routeSource === "inherited" ? "native" : "dsmm-config");
}
/** Use the live provider owner and this call's complete frozen parameters, not envelope presence alone. */
export function requiresDsmmCallAdmission(config, classifier, uncapturedAgent) {
    return uncapturedAgent !== undefined && classifyDsmmAgent(uncapturedAgent) === "dsmm"
        || (classifier?.requiresRaw?.(config) ?? config.customParameters !== undefined);
}
const envelopeFields = new Set(["messages", "tools", "toolHistory", "sessionId", "signal"]);
export function freezeDsmmJson(value) {
    let detached;
    try {
        detached = copyRouteJson(value);
    }
    catch (cause) {
        throw new LlmError("LLM parameters must be bounded lossless JSON", "INVALID_CONFIG", { cause });
    }
    const freeze = (item) => {
        if (item !== null && typeof item === "object") {
            for (const child of Object.values(item))
                freeze(child);
            Object.freeze(item);
        }
    };
    freeze(detached);
    return detached;
}
export function snapshotDsmmCall(config) {
    const copy = freezeDsmmJson(config);
    for (const key of Object.keys(copy))
        if (!["provider", "model", "reasoningEffort", "temperature", "maxTokens", "stop", "customParameters"].includes(key))
            throw new LlmError(`Unknown call field: ${key}`, "INVALID_CONFIG");
    try {
        modelRouteFromCall(copy);
    }
    catch (cause) {
        throw new LlmError("LLM route fields conflict or contain invalid values", "INVALID_CONFIG", { cause });
    }
    return copy;
}
export function preparedConfigMatches(request, config) {
    return isDeepStrictEqual(Object.fromEntries(Object.entries(request).filter(([key]) => !envelopeFields.has(key))), config);
}
/** Consumption is synchronous, including rejected dispatches and streams never iterated. */
export function singleUsePreparedStream(dispatch) {
    let consumed = false;
    return request => {
        if (consumed)
            throw new LlmError("Prepared LLM call was consumed", "INVALID_PREPARED_CALL");
        consumed = true;
        return dispatch(request);
    };
}
/** Native execution service; an optional stock collaborator supports explicit isolated hosts. */
export class DsmmAwareLlmRuntime extends LlmRuntime {
    stock;
    requestOwner;
    calls = new WeakMap();
    admitted = new WeakSet();
    preparedRequests = new WeakSet();
    pending = new WeakMap();
    active = new WeakMap();
    nativeClassifications = new WeakMap();
    lifetime = new AbortController();
    detachRequestOwner;
    constructor(ctx, stock, requestOwner) {
        super(ctx);
        this.stock = stock;
        this.requestOwner = requestOwner;
        ctx.effect(() => () => this.lifetime.abort(new LlmError("LLM Host retired", "INVALID_PREPARED_CALL")));
        ctx.on("session/event", (session, event) => {
            if (event.type !== "step/end" && event.type !== "turn/end")
                return;
            const agent = ctx.get("agents")?.get(session.id);
            if (agent === undefined)
                return;
            this.active.get(agent)?.revocation.abort();
            this.active.delete(agent);
            this.pending.delete(agent);
            this.nativeClassifications.delete(agent);
        }, { global: true });
        this.bindRequestOwner(ctx);
    }
    /** The Core entry installs its final binder after its request-routing collaborators. */
    bindRequestOwner(ctx) {
        this.detachRequestOwner?.();
        this.detachRequestOwner = ctx.on("agent/request", async (frame, next) => {
            const proposal = await next();
            frame.signal.throwIfAborted();
            if (this.stock === undefined && !this.ownsScope(frame)) {
                if (proposal.customParameters !== undefined)
                    throw new LlmError("Raw request scope has another LLM owner", "INVALID_PREPARED_CALL");
                return proposal;
            }
            const result = await this.requestOwner.preflight(frame, proposal);
            frame.signal.throwIfAborted();
            if (result.kind === "native") {
                const config = snapshotDsmmCall(proposal);
                this.nativeClassifications.set(frame.agent, { frame: Object.freeze({ ...frame }), config });
                return config;
            }
            this.nativeClassifications.delete(frame.agent);
            if (result.admission.agent !== frame.agent)
                throw new LlmError("LLM admission belongs to another Agent", "INVALID_PREPARED_CALL");
            this.active.get(frame.agent)?.revocation.abort();
            const captured = { frame: Object.freeze({ ...frame }), admission: result.admission, effortSource: result.effortSource ?? captureDsmmEffortSource(frame.agent),
                ...(result.kind === "dsmm" ? { generation: result.generation } : {}), revocation: new AbortController() };
            this.active.set(frame.agent, captured);
            const retire = () => {
                if (this.active.get(frame.agent) === captured && frame.agent.status === "running" && !frame.signal.aborted)
                    frame.agent.cancel({ kind: "hook", reason: "DSMM LLM admission retired" }, { keepInbox: true });
            };
            const externalSignals = [captured.admission.signal, ...captured.generation === undefined ? [] : [captured.generation.signal], this.lifetime.signal];
            for (const signal of externalSignals)
                signal.addEventListener("abort", retire, { once: true });
            captured.revocation.signal.addEventListener("abort", () => { for (const signal of externalSignals)
                signal.removeEventListener("abort", retire); }, { once: true });
            if (externalSignals.some(signal => signal.aborted))
                retire();
            this.assertCaptured(captured);
            const prior = frame.agent.session.requestHeader();
            if (prior !== undefined)
                snapshotDsmmCall(prior.config);
            const config = snapshotDsmmCall(result.config);
            this.calls.set(config, captured);
            this.admitted.add(config);
            this.pending.set(frame.agent, config);
            return config;
        }, { prepend: true, global: true });
    }
    ownsScope(frame) {
        const current = frame.agent.ctx.get("llm");
        return current !== undefined && (Reflect.get(current, symbols.original) ?? current) === (Reflect.get(this, symbols.original) ?? this);
    }
    assertCaptured(call) {
        this.lifetime.signal.throwIfAborted();
        call.frame.signal.throwIfAborted();
        call.admission.signal.throwIfAborted();
        call.generation?.signal.throwIfAborted();
        call.generation?.assertCurrent();
        call.revocation.signal.throwIfAborted();
        call.admission.assertCurrent();
        if (this.stock === undefined && !this.ownsScope(call.frame))
            throw new LlmError("Request scope no longer resolves this native LLM owner", "INVALID_PREPARED_CALL");
        if (this.ctx.get("agents")?.get(call.frame.agent.id) !== call.frame.agent || call.frame.agent.status !== "running" || this.active.get(call.frame.agent) !== call)
            throw new LlmError("LLM Agent lifecycle is no longer current", "INVALID_PREPARED_CALL");
    }
    finishCaptured(call) {
        call.revocation.abort();
        if (this.active.get(call.frame.agent) === call)
            this.active.delete(call.frame.agent);
    }
    uncapturedNativeConfig(proposal, agent, signal, fallback = false) {
        this.lifetime.signal.throwIfAborted();
        const config = snapshotDsmmCall(proposal);
        const classifier = this.ctx.get("dsmmLlmRoutes");
        const native = agent === undefined ? undefined : this.nativeClassifications.get(agent);
        const classified = native !== undefined && native.frame.signal === signal && !native.frame.signal.aborted
            && agent?.status === "running" && this.ctx.get("agents")?.get(agent.id) === agent
            && (this.stock !== undefined || this.ownsScope(native.frame))
            && (fallback ? isDeepStrictEqual(config, native.config) : proposal === native.config);
        if (requiresDsmmCallAdmission(config, classifier, classified ? undefined : agent))
            throw new LlmError("Enhanced requests require their exact Host proposal", "INVALID_PREPARED_CALL");
        return config;
    }
    async prepareCall(proposal, signal, configure) {
        const initiator = this.ctx.get("agents")?.currentInitiator();
        if (initiator !== undefined && this.pending.has(initiator) && this.pending.get(initiator) !== proposal)
            throw new LlmError("DSMM request lost its exact proposal identity", "INVALID_PREPARED_CALL");
        const captured = this.calls.get(proposal);
        if (captured === undefined) {
            if (this.admitted.has(proposal))
                throw new LlmError("DSMM proposal was already consumed", "INVALID_PREPARED_CALL");
            const config = this.uncapturedNativeConfig(proposal, initiator, signal);
            const prepared = await this.prepareNativeCall(config, signal, configure);
            this.lifetime.signal.throwIfAborted();
            signal?.throwIfAborted();
            return prepared;
        }
        this.calls.delete(proposal);
        this.pending.delete(captured.frame.agent);
        try {
            if (signal !== captured.frame.signal)
                throw new LlmError("LLM request signal does not match admission", "INVALID_PREPARED_CALL");
            return await this.prepareAdmittedCall(proposal, signal, captured, configure);
        }
        catch (error) {
            // NO_ADAPTER is the official loop's signal to dispatch without a prepared call.
            if (error instanceof LlmError && error.code === "NO_ADAPTER")
                throw new LlmError("Admitted DSMM generation could not prepare the request", "DSMM_PREPARATION_FAILED", { cause: error });
            throw error;
        }
    }
    prepareNativeCall(config, signal, configure) {
        const classifier = this.ctx.get("dsmmLlmRoutes");
        const supportsStop = classifier?.supportsNativeStop?.(config.provider) ?? true;
        const select = (controls, model) => {
            const selected = configure === undefined ? controls : configure(controls, model);
            const final = snapshotDsmmCall({ ...selected, provider: config.provider, model: config.model });
            if (final.customParameters !== undefined || !supportsStop && final.stop !== undefined) {
                throw new LlmError("Final controls require raw parameter admission before preparation", "UNSUPPORTED_ROUTE_PARAMETERS");
            }
            return selected;
        };
        return this.stock === undefined ? super.prepareCall(config, signal, select) : this.stock.prepareCall(config, signal, select);
    }
    async prepareAdmittedCall(proposal, signal, captured, configure) {
        this.assertCaptured(captured);
        if (captured.generation === undefined) {
            const preparationSignal = AbortSignal.any([signal, captured.admission.signal, captured.revocation.signal, this.lifetime.signal]);
            const prepared = await this.prepareNativeCall(proposal, preparationSignal, configure);
            this.assertCaptured(captured);
            return this.bindPrepared(captured, signal, prepared, (request, providerSignal) => prepared.stream(Object.freeze({ ...request, signal: providerSignal })));
        }
        let streamEffortSource = captured.effortSource;
        const preparationSignal = AbortSignal.any([signal, captured.admission.signal, captured.generation.signal, captured.revocation.signal, this.lifetime.signal]);
        const bound = await captured.generation.prepareCall(proposal.provider, proposal.model, preparationSignal, () => this.assertCaptured(captured), () => streamEffortSource);
        this.assertCaptured(captured);
        if (bound.model.provider !== proposal.provider || bound.model.id !== proposal.model)
            throw new LlmError("Provider resolved another model", "INVALID_ADAPTER");
        if (configure !== undefined) {
            const { provider, model, customParameters, ...controls } = proposal;
            const selected = configure(freezeDsmmJson(controls), freezeDsmmJson(bound.model));
            proposal = snapshotDsmmCall({ ...selected, provider, model, ...(customParameters === undefined ? {} : { customParameters }) });
            this.assertCaptured(captured);
        }
        const customParameters = proposal.customParameters;
        const defaultReasoningEffort = captured.generation.defaultReasoningEffort ?? bound.model.reasoning?.defaultEffort;
        const adapterDefaults = Object.freeze({
            ...(proposal.maxTokens === undefined && !["max_tokens", "max_completion_tokens", "max_output_tokens"].some(key => Object.hasOwn(customParameters ?? {}, key)) && bound.model.defaultMaxTokens !== undefined ? { maxTokens: true } : {}),
            ...(proposal.reasoningEffort === undefined && !Object.hasOwn(customParameters ?? {}, "reasoning_effort") && defaultReasoningEffort !== undefined ? { reasoningEffort: true } : {}),
        });
        const config = snapshotDsmmCall({ ...proposal, ...(adapterDefaults.maxTokens ? { maxTokens: bound.model.defaultMaxTokens } : {}),
            ...(adapterDefaults.reasoningEffort ? { reasoningEffort: defaultReasoningEffort } : {}) });
        if (adapterDefaults.reasoningEffort)
            streamEffortSource = "native";
        if (streamEffortSource === "native" && config.reasoningEffort !== undefined && !bound.model.reasoning?.efforts.some(effort => effort.id === config.reasoningEffort)) {
            throw new LlmError("The native selection's reasoning effort is not supported by this model", "UNSUPPORTED_REASONING_EFFORT");
        }
        return this.bindPrepared(captured, signal, {
            config, adapterDefaults, retryPolicy: freezeDsmmJson(captured.generation.retryPolicy),
            ...(bound.model.context === undefined ? {} : { context: freezeDsmmJson(bound.model.context) }),
            ...(bound.model.inputModalities === undefined ? {} : { inputModalities: freezeDsmmJson(bound.model.inputModalities) }),
            ...(bound.model.systemPromptUpdate === undefined ? {} : { systemPromptUpdate: bound.model.systemPromptUpdate }),
            ...(bound.model.toolUpdate === undefined ? {} : { toolUpdate: bound.model.toolUpdate }),
            stream: bound.stream,
        }, (request, providerSignal) => this.ctx.waterfall(this, "llm/stream", request, () => this.adapterStreamFor(bound, request, providerSignal)));
    }
    bindPrepared(captured, signal, prepared, dispatchPrepared) {
        const { stream: _stream, ...metadata } = prepared;
        const { config, adapterDefaults } = metadata;
        return Object.freeze({ ...freezeDsmmJson(metadata),
            stream: singleUsePreparedStream((request) => {
                this.assertCaptured(captured);
                if (!isAgentLoopRequest(request) || !Object.isFrozen(request) || request.signal !== signal || request.sessionId !== captured.frame.agent.id
                    || !preparedConfigMatches(request, config))
                    throw new LlmError("Prepared LLM request changed", "INVALID_PREPARED_CALL");
                this.preparedRequests.add(request);
                const session = captured.frame.agent.session;
                const header = canonicalHeader({ config, adapterDefaults, ...(request.tools === undefined ? {} : { tools: [...request.tools] }) });
                if (!isDeepStrictEqual(session.requestHeader(), header))
                    session.append("request/header", { header, reason: "change" });
                const dispatch = async function* (runtime) {
                    try {
                        runtime.assertCaptured(captured);
                        if (await runtime.ctx.get("sessions")?.flush(session) !== true)
                            throw new LlmError("Native request header has no persistence listener", "PERSISTENCE_UNAVAILABLE");
                        runtime.assertCaptured(captured);
                        const providerSignal = AbortSignal.any([captured.frame.signal, captured.admission.signal,
                            ...captured.generation === undefined ? [] : [captured.generation.signal], captured.revocation.signal, runtime.lifetime.signal]);
                        yield* dispatchPrepared(request, providerSignal);
                    }
                    finally {
                        runtime.finishCaptured(captured);
                    }
                };
                return dispatch(this);
            }),
        });
    }
    async *adapterStreamFor(bound, request, signal) {
        let iterator;
        const failure = (error) => ({ type: "finish", reason: { kind: signal.aborted ? "aborted" : "error",
                failure: error instanceof LlmError ? error.failure : { code: "UNKNOWN", message: errorChain(error) } } });
        let messages = projectFilesToText(request.messages, ref => {
            const path = this.ctx.get("attachments")?.fileHostPath(ref);
            return path === undefined ? undefined : this.ctx.get("fs")?.processPathFromHostPath(path);
        });
        if (bound.model.inputModalities !== undefined && !bound.model.inputModalities.includes("image"))
            messages = projectImagesForTextModel(messages);
        const projected = projectToolUpdates(messages, request.tools, bound.model.toolUpdate, request.toolHistory);
        const projectedMessages = [...projected.messages];
        Object.freeze(projectedMessages);
        signal.throwIfAborted();
        const options = Object.freeze({ ...request, signal, messages: projectedMessages, ...(projected.tools === undefined ? {} : { tools: [...projected.tools] }) });
        try {
            iterator = bound.stream(options)[Symbol.asyncIterator]();
        }
        catch (error) {
            yield failure(error);
            return;
        }
        let completed = false;
        try {
            while (true) {
                let next;
                try {
                    next = await iterator.next();
                }
                catch (error) {
                    completed = true;
                    yield failure(error);
                    return;
                }
                if (next.done) {
                    completed = true;
                    return;
                }
                yield next.value;
            }
        }
        finally {
            if (!completed)
                await iterator.return?.();
        }
    }
    stream(options) {
        const agent = options.sessionId === undefined ? undefined : this.ctx.get("agents")?.get(options.sessionId);
        const captured = agent === undefined ? undefined : this.active.get(agent);
        if (this.preparedRequests.has(options) || captured !== undefined && (options.signal === captured.frame.signal || isAgentLoopRequest(options))) {
            throw new LlmError("Admitted DSMM requests require their prepared call", "INVALID_PREPARED_CALL");
        }
        const config = this.uncapturedNativeConfig(Object.fromEntries(Object.entries(options).filter(([key]) => !envelopeFields.has(key))), agent, options.signal, true);
        const request = Object.isFrozen(options) ? options : { ...options, ...config };
        return this.stock === undefined ? super.stream(request) : this.stock.stream(request);
    }
    registerAdapter(...args) { return this.stock === undefined ? super.registerAdapter(...args) : this.stock.registerAdapter(...args); }
    registerConfigurableProviders(...args) { return this.stock === undefined ? super.registerConfigurableProviders(...args) : this.stock.registerConfigurableProviders(...args); }
    registerModelDiscovery(...args) { return this.stock === undefined ? super.registerModelDiscovery(...args) : this.stock.registerModelDiscovery(...args); }
    resolveCallConfig(...args) { return this.stock === undefined ? super.resolveCallConfig(...args) : this.stock.resolveCallConfig(...args); }
    resolveModelInfo(...args) { return this.stock === undefined ? super.resolveModelInfo(...args) : this.stock.resolveModelInfo(...args); }
    listModels(...args) { return this.stock === undefined ? super.listModels(...args) : this.stock.listModels(...args); }
    listProviders() { return this.stock === undefined ? super.listProviders() : this.stock.listProviders(); }
    listConfigurableProviders() { return this.stock === undefined ? super.listConfigurableProviders() : this.stock.listConfigurableProviders(); }
    discoverModels(...args) { return this.stock === undefined ? super.discoverModels(...args) : this.stock.discoverModels(...args); }
    providerRetryPolicy(...args) { return this.stock === undefined ? super.providerRetryPolicy(...args) : this.stock.providerRetryPolicy(...args); }
    imageRequestPricing(...args) { return this.stock === undefined ? super.imageRequestPricing(...args) : this.stock.imageRequestPricing(...args); }
    fileRequestText(...args) { return this.stock === undefined ? super.fileRequestText(...args) : this.stock.fileRequestText(...args); }
}
//# sourceMappingURL=host-llm.js.map