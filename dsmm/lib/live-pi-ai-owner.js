import { symbols } from "@deepseek-ai/cordis";
import { LlmError } from "@deepseek-ai/dsh-llm";
import { Config } from "@deepseek-ai/dsh-llm-pi-ai";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { brandString } from "@deepseek-ai/dsh-brand";
import { isDeepStrictEqual } from "node:util";
import { createDsmmPiAiProviderOwner } from "./native-pi-ai-wire.js";
import { snapshotDsmmCall } from "./host-llm.js";
import { DsmmMissingProviderError, modelRouteToCall } from "./role-llm.js";
import { normalizeModelRouteJson } from "./route-json.js";
const original = (value) => Reflect.get(value, symbols.original) ?? value;
/** Captures public registering-fiber provenance; the native runtime remains the sole registry. */
export class LivePiAiOwner {
    ctx;
    native;
    registrations = new Map();
    constructor(ctx, native) {
        this.ctx = ctx;
        this.native = native;
    }
    requiresRaw(config) {
        return config.customParameters !== undefined || config.stop !== undefined
            && this.registrations.get(config.provider)?.scope.fiber.entry?.options.name === "@deepseek-ai/dsh-llm-pi-ai";
    }
    register(scope, providers, adapter, handle) {
        const record = { scope, adapter, life: new AbortController(), generations: new Map(), providers: [...providers] };
        const retire = () => {
            for (const generation of record.generations.values())
                generation.retire.abort(new LlmError("Provider generation retired", "INVALID_PREPARED_CALL"));
            record.generations.clear();
        };
        const remove = () => {
            retire();
            record.life.abort();
            for (const provider of record.providers)
                if (this.registrations.get(provider) === record)
                    this.registrations.delete(provider);
        };
        for (const provider of providers)
            this.registrations.set(provider, record);
        scope.effect(() => remove);
        scope.on("loader/volatile-update", retire, { prepend: true });
        scope.on("loader/partial-dispose", entry => { if (entry === scope.fiber.entry)
            retire(); }, { prepend: true, global: true });
        scope.on("credentials/reference-updated", retire, { prepend: true, global: true });
        const wrapped = Object.assign(() => { remove(); handle(); }, {
            replace: (next) => {
                // Native validation is atomic: a rejected replacement leaves the old routes registered.
                retire();
                handle.replace(next);
                for (const provider of record.providers)
                    if (this.registrations.get(provider) === record)
                        this.registrations.delete(provider);
                record.providers = [...next];
                for (const provider of next)
                    this.registrations.set(provider, record);
            },
        });
        return wrapped;
    }
    generation(provider) {
        const record = this.registrations.get(provider);
        if (record === undefined)
            throw new LlmError("Provider registration is not ready", "DSMM_PROVIDER_NOT_READY");
        const { scope, adapter } = record;
        if (scope.fiber.entry?.options.name !== "@deepseek-ai/dsh-llm-pi-ai")
            throw new LlmError("This provider has no raw executor", "UNSUPPORTED_ROUTE_PARAMETERS");
        const config = scope.fiber.config;
        if (config === null || typeof config !== "object" || !("providers" in config) || config.providers === null || typeof config.providers !== "object"
            || !("get" in config.providers) || typeof config.providers.get !== "function")
            throw new LlmError("Pi-AI live configuration is unavailable", "DSMM_PROVIDER_NOT_READY");
        const ref = config.providers;
        const current = ref.get()[provider];
        if (current === undefined)
            throw new LlmError("Pi-AI no longer declares this route", "DSMM_PROVIDER_NOT_READY");
        const profile = structuredClone(current);
        const cached = record.generations.get(provider);
        if (cached !== undefined) {
            try {
                cached.value.assertCurrent();
                return cached.value;
            }
            catch {
                cached.retire.abort();
                record.generations.delete(provider);
            }
        }
        const retire = new AbortController();
        const credentials = scope.get("credentials");
        const signal = AbortSignal.any([record.life.signal, retire.signal]);
        const assertCurrent = () => {
            signal.throwIfAborted();
            if (this.registrations.get(provider) !== record || scope.fiber.state !== 2 || scope.fiber.entry?.fiber !== scope.fiber
                || scope.fiber.config !== config || !isDeepStrictEqual(ref.get()[provider], profile)
                || (credentials === undefined ? scope.get("credentials") !== undefined : scope.get("credentials") === undefined || original(scope.get("credentials")) !== original(credentials))) {
                retire.abort(new LlmError("Provider configuration or owner changed", "INVALID_PREPARED_CALL"));
                signal.throwIfAborted();
            }
        };
        assertCurrent();
        const owner = createDsmmPiAiProviderOwner(this.ctx, {
            config: { providers: { [provider]: structuredClone(profile) } },
            settingsNamespace: scope.fiber.entry.options.id,
            auth: { credentials: new InMemoryCredentialStore(), authContext: {
                    env: async () => { throw new LlmError("Raw requests require named credentials", "MISSING_CREDENTIAL"); }, fileExists: async () => false,
                } },
            async resolveApiKey(_provider, reference, requestSignal) {
                assertCurrent();
                requestSignal?.throwIfAborted();
                if (credentials === undefined)
                    throw new LlmError("The credential service is unavailable", "MISSING_CREDENTIAL");
                const key = await credentials.resolve(brandString(reference));
                assertCurrent();
                requestSignal?.throwIfAborted();
                return key?.value;
            },
        }, { signal, adapter, assertCurrent });
        const value = owner.generation(provider);
        record.generations.set(provider, { value, retire });
        return value;
    }
    async resolveRoute(input, signal) {
        const route = normalizeModelRouteJson(input), call = snapshotDsmmCall(modelRouteToCall(route));
        signal?.throwIfAborted();
        if (!this.native.listProviders().some(row => row.id === route.provider))
            throw new DsmmMissingProviderError();
        if (!this.requiresRaw(call)) {
            try {
                await this.native.resolveCallConfig(call, signal);
                return route;
            }
            catch (error) {
                if (!(error instanceof LlmError) || !["UNSUPPORTED_REASONING_EFFORT", "UNSUPPORTED_OPTION"].includes(error.code))
                    throw error;
            }
        }
        const generation = this.generation(route.provider);
        await generation.prepareCall(route.provider, route.model, signal ?? generation.signal);
        generation.assertCurrent();
        signal?.throwIfAborted();
        return route;
    }
}
//# sourceMappingURL=live-pi-ai-owner.js.map