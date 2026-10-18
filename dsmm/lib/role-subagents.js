import { getTraceable, symbols } from "@deepseek-ai/cordis";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { DSMM_ROLES } from "./roles.js";
import { registerRoleHarnessIdentity } from "./role-identity.js";
import { isDsmmRoleId } from "./roles.js";
import { DsmmRolePolicy, roleToolName } from "./role-policy.js";
import { roleProviderName } from "./role-providers.js";
import { capturedRoleInvocation, invocationAgentOptions, invocationView, resolveRoleInvocation } from "./role-invocation.js";
import { childOwnedSessionEvents } from "./session-scope.js";
import { agentForScope, nativeAgentContext, scopeParentOf } from "./native-scope.js";
import { roleRouteRuntimeState } from "./role-routing.js";
import { modelRouteFromCall } from "./role-llm.js";
import { buildDsmmAgentGuidance, buildDsmmLocaleGuidance } from "./prompts.js";
const hostControls = ["send_message", "interrupt_agent", "exit_plan_mode", "ask_user_question", "todo_write", "job_output", "job_list", "job_kill"];
// Agent-owned policy realms survive a bundle reinstall; do not register another
// identity prompt/tools layer on the same retained live Agent.
const admittedRealms = new WeakMap();
const callableDefinitions = new WeakMap();
/** Keep native controls on the frozen startup substrate, not desired-save reconciliation. */
export async function registerNativeSubagentControls(ctx) {
    const tools = ctx.get("tools");
    if (tools === undefined || ctx.get("subagents") === undefined)
        return;
    if (tools.get("send_message") !== undefined && tools.get("interrupt_agent") !== undefined)
        return;
    const anchor = ctx.get("profileContext")?.installAnchor;
    if (anchor === undefined)
        return;
    try {
        const plugin = await import(pathToFileURL(createRequire(anchor).resolve("@deepseek-ai/dsh-tool-subagent-control")).href);
        await ctx.plugin(plugin).await();
    }
    catch {
        ctx.logger.warn("DSMM native subagent controls unavailable; continuable control requires the installed host substrate");
    }
}
/** Project the captured invocation without reapplying deployment defaults. */
export function roleInvocationView(invocation, label, mode, getSettings, child, ids = {}) {
    return roleInvocationObservation(invocation, label, mode, getSettings, child, ids).view;
}
/** Distinguish the captured route from an observed native request. */
export function roleInvocationObservation(invocation, label, mode, getSettings, child, ids = {}) {
    const view = invocationView(invocation, label, mode, ids);
    if (child === undefined)
        return { view, routeKind: "initial" };
    const actual = latestOwnRoleRoute(child);
    if (actual.status === "known")
        return { view: { ...view, route: actual.route }, routeKind: "actual" };
    const route = roleRouteRuntimeState(child, getSettings(child), invocation.target, getSettings.admission?.(child).epoch).route;
    return { view: route === undefined ? view : { ...view, route: { ...route } }, routeKind: "initial" };
}
function latestOwnRoleRoute(child) {
    const own = childOwnedSessionEvents(child.session);
    for (let index = own.length - 1; index >= 0; index--) {
        const event = own[index];
        if (event.type !== "request/header")
            continue;
        const config = event.data?.header?.config;
        if (typeof config?.provider !== "string" || typeof config.model !== "string"
            || config.reasoningEffort !== undefined && typeof config.reasoningEffort !== "string") {
            return { status: "unknown", reason: "invalid-own-request-header" };
        }
        try {
            return { status: "known", source: "own-native-request-header", route: Object.freeze(modelRouteFromCall({ ...config, provider: config.provider, model: config.model })) };
        }
        catch {
            return { status: "unknown", reason: "invalid-own-request-header" };
        }
    }
    return { status: "unknown", reason: "no-own-request-header" };
}
/** Both observations belong to this exact native Agent; no parent/settings/route-lock fallback. */
export function roleRouteComparison(child) {
    const agent = child;
    const invocation = capturedRoleInvocation(agent);
    return { childId: child.id, initialRoute: invocation === undefined ? { status: "unknown", reason: "missing-invocation-capture" }
            : { status: "known", source: "invocation-capture", route: Object.freeze({ ...invocation.initialRoute }) }, liveRoute: latestOwnRoleRoute(agent) };
}
function presentationFields(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
function roleTitle(role) {
    return `${role.kind === "category" ? "Category" : "Role"}: ${role.name} (${role.id})`;
}
/** Presenters accept streaming/replayed input independently of strict execution validation. */
function installRolePresenters(definition, entry) {
    const presentCall = args => {
        const fields = presentationFields(args);
        const target = entry.targetParameter === undefined ? entry.targets[0] : fields?.[entry.targetParameter];
        const role = isDsmmRoleId(target) && entry.targets.includes(target) ? DSMM_ROLES.find(row => row.id === target && row.kind === entry.kind) : undefined;
        return { card: "generic", title: role === undefined ? `Requested ${entry.kind}` : `Requested ${roleTitle(role)}`,
            ...(typeof fields?.description === "string" ? { rawInput: fields.description } : {}) };
    };
    // defineTool soft-validates complete args before its own presenter wrappers;
    // the native definition's presenters also serve partial streams and old logs.
    definition.presentCall = presentCall;
    definition.presentResult = (args, result) => {
        const meta = result.isError ? undefined : presentationFields(result.meta);
        const role = meta === undefined ? undefined : DSMM_ROLES.find(row => row.id === meta.role && row.kind === entry.kind);
        if (role !== undefined && typeof meta?.label === "string" && ["normal", "low", "high", "max"].includes(meta.level)
            && (meta.mode === "one-shot" || meta.mode === "continuable") && ["inherited", "primary", "level", "invocation-route"].includes(meta.routeSource)) {
            return { card: "generic", title: `${roleTitle(role)} · ${meta.level}` };
        }
        return { card: "generic", title: presentCall(args).title };
    };
}
/** Shared by runtime registration and the prompt assembler; empty groups have no callable entry. */
export function callableRoleInventory(settings, targets) {
    const admitted = targets.filter(id => id !== "dsmm-orchestrator" && settings.roles[id]);
    const roleTargets = admitted.filter(id => DSMM_ROLES.find(row => row.id === id)?.kind === "role");
    const categories = admitted.filter(id => DSMM_ROLES.find(row => row.id === id)?.kind === "category");
    return [
        ...settings.subagents.toolTopology === "per-role" ? roleTargets.map(id => ({ name: roleToolName(id), kind: "role", targets: [id] }))
            : roleTargets.length === 0 ? [] : [{ name: "dsmm_role", kind: "role", targets: roleTargets, targetParameter: "role" }],
        ...categories.length === 0 ? [] : [{ name: "dsmm_category", kind: "category", targets: categories, targetParameter: "category" }]
    ];
}
/** Exact currently exposed definitions, suitable for E's runtime guidance and safe capability views. */
export function admittedCallableRoleInventory(agent, settings, policy, tools) {
    const allowed = new Set(policy.targets(agent)), providers = nativeAgentContext(agent).get("subagents");
    return tools.schemas(agent).flatMap(schema => {
        const definition = tools.get(schema.name, agent), registered = definition === undefined ? undefined : callableDefinitions.get(definition);
        if (registered === undefined || policy.toolDenial(agent, schema.name, tools) !== undefined)
            return [];
        const targets = registered.entry.targets.filter(target => allowed.has(target) && settings.roles[target]
            && providers?.getProvider(roleProviderName(target)) === registered.providers.get(target)
            && providers?.getProvider(roleProviderName(target))?.capabilities.depthLimit === true);
        return targets.length === 0 ? [] : [{ ...registered.entry, targets }];
    });
}
function registerRoleTool(agent, agentCtx, tools, entry, getSettings, policy, admission) {
    const settings = getSettings(agent);
    const subagents = agentCtx.get("subagents");
    if (subagents === undefined)
        throw new Error("DSMM role tools require native subagents");
    const background = settings.subagents.enableRunInBackground;
    const admittedProviders = new Map(entry.targets.map(target => [target, subagents.getProvider(roleProviderName(target))]));
    const incomplete = new Map();
    const definition = defineTool({
        name: entry.name, description: `Delegate a bounded ${entry.kind} task through native activation. Waits for the useful result by default.${background ? " Set run_in_background to receive an accepted child/message receipt; native completion notifies the parent." : " Background execution is disabled."}`,
        parameters: { description: { type: "string", required: true }, prompt: { type: "string", required: true },
            ...(entry.targetParameter === undefined ? {} : { [entry.targetParameter]: { type: "string", enum: entry.targets, required: true } }),
            level: { type: "string", enum: ["normal", "low", "high", "max"] },
            ...(settings.subagents.allowRouteOverride ? { route: { oneOf: [
                        { type: "object", additionalProperties: false, properties: { reasoningEffort: { type: "string", required: true } } },
                        { type: "object", additionalProperties: true, properties: { provider: { type: "string", required: true }, model: { type: "string", required: true }, reasoningEffort: { type: "string" } } }
                    ] } } : {}),
            ...(background ? { run_in_background: { type: "boolean" } } : {}) },
        output: { schema: { type: "json" }, render(_args, value) {
                const result = value;
                const invocation = result.invocation;
                const route = invocation?.route;
                const metadata = invocation === undefined ? "" : `${invocation.role} level=${invocation.level}${route === undefined ? "" : ` route=${route.provider}/${route.model}${route.reasoningEffort === undefined ? "" : ` effort=${route.reasoningEffort}`}`}`;
                return result.kind === "foreground" ? [{ type: "text", text: metadata }, ...result.output ?? []]
                    : [{ type: "text", text: `${metadata}\naccepted subagent ${result.subagentId}` }];
            }, presentationMeta(_args, value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value.invocation ?? null : null; } },
        finalizeContent(exec, result) {
            const partial = incomplete.get(exec.token);
            incomplete.delete(exec.token);
            if (!partial || !result.isError || !["DSMM_INCOMPLETE", "ABORTED"].includes(result.error.info?.code ?? ""))
                return;
            return [...result.content, { type: "text", text: `Child outcome: ${partial.stopReason}. The following assistant output is partial, not a completed result.` }, ...partial.output,
                ...partial.diagnostic === undefined ? [] : [{ type: "text", text: `Provider diagnostic: ${partial.diagnostic}` }]];
        },
        async execute(args, exec) {
            const fields = ["description", "prompt", "level", ...entry.targetParameter === undefined ? [] : [entry.targetParameter],
                ...settings.subagents.allowRouteOverride ? ["route"] : [], ...background ? ["run_in_background"] : []];
            if (Object.keys(exec.arguments).some((key) => !fields.includes(key)))
                throw new SubagentError("DSMM delegation parameter is unsupported by this admitted tool", "UNSUPPORTED_CAPABILITY");
            const parent = exec.agent;
            if (parent === undefined)
                throw new SubagentError("DSMM delegation requires a calling Agent", "UNAUTHORIZED");
            if (parent !== agent || tools.get(entry.name, parent) !== definition || policy.toolDenial(agent, entry.name, tools) !== undefined)
                throw new SubagentError("DSMM tool is not the exact admitted caller definition", "UNAUTHORIZED");
            const target = entry.targetParameter === undefined ? entry.targets[0] : exec.arguments[entry.targetParameter];
            if (!isDsmmRoleId(target) || !entry.targets.includes(target) || DSMM_ROLES.find(row => row.id === target).kind !== entry.kind)
                throw new SubagentError("DSMM target is unknown, cross-kind or not admitted", "UNAUTHORIZED");
            const role = DSMM_ROLES.find(row => row.id === target);
            const label = `${role.id.slice("dsmm-".length).split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}: ${args.description}`;
            const admitted = policy.assertDelegation(parent, role.id);
            const current = getSettings(parent);
            const provider = subagents.getProvider(roleProviderName(role.id));
            if (provider === undefined || provider !== admittedProviders.get(role.id))
                throw new SubagentError("DSMM exact admitted role provider is unavailable", "NO_PROVIDER");
            return admission.duringCall(parent, exec.signal, async (signal) => {
                const invocation = await resolveRoleInvocation(parent, role.id, current, signal, { ...(args.level === undefined ? {} : { level: args.level }), ...(args.route === undefined ? {} : { route: args.route }) });
                const capturedProvider = provider;
                const request = { parent, agentPreset: role.id, prompt: [{ type: "text", text: args.prompt }],
                    agentOptions: invocationAgentOptions(invocation), maxDepth: subagents.resolveMaxDepth(current.subagents.maxDepth) };
                const assertCurrent = () => {
                    if (policy.assertDelegation(parent, role.id).epoch !== admitted.epoch)
                        throw new SubagentError("DSMM parent admission changed before delegation", "UNAUTHORIZED");
                    if (subagents.getProvider(roleProviderName(role.id)) !== capturedProvider)
                        throw new SubagentError("DSMM exact provider changed before delegation", "NO_PROVIDER");
                };
                signal.throwIfAborted();
                const requestedBackground = background && args.run_in_background === true;
                assertCurrent();
                const pending = await admission.reserve(exec, invocation, provider, request.maxDepth);
                let activation;
                let cancellation;
                const cancel = () => { if (activation) {
                    cancellation ??= activation.dispose();
                    void cancellation.catch(() => { });
                } };
                try {
                    activation = await subagents.startActivation({ childId: pending.childId, provider: provider.name, label, request, signal: pending.signal, delivery: requestedBackground ? "parent" : "caller" });
                    admission.track(activation);
                    pending.signal.addEventListener("abort", cancel, { once: true });
                    if (pending.signal.aborted) {
                        cancel();
                        await cancellation;
                        pending.signal.throwIfAborted();
                    }
                    const view = invocationView(invocation, args.description, "continuable", { childId: activation.childId });
                    if (requestedBackground)
                        return { kind: "continuable", subagentId: activation.childId, messageId: activation.messageId ?? null, invocation: { ...view } };
                    const result = await activation.result;
                    if (result.stopReason !== "completed")
                        incomplete.set(exec.token, result);
                    if (cancellation)
                        await cancellation;
                    pending.signal.throwIfAborted();
                    if (result.stopReason !== "completed")
                        throw new SubagentError(`Role activation ended: ${result.stopReason}`, "DSMM_INCOMPLETE");
                    return { kind: "foreground", output: result.output,
                        ...(result.structured === undefined ? {} : { structured: result.structured }), invocation: { ...view } };
                }
                finally {
                    pending.signal.removeEventListener("abort", cancel);
                    await pending.release();
                }
            });
        }
    });
    installRolePresenters(definition, entry);
    callableDefinitions.set(definition, { entry: Object.freeze({ ...entry, targets: Object.freeze([...entry.targets]) }), providers: admittedProviders });
    const dispose = tools.register(definition);
    return () => { callableDefinitions.delete(definition); dispose(); };
}
/** Published name retained; all native/headless Agents consume one admitted policy. */
export async function registerHeadlessRoleTools(ctx, controller, getSettings, policy, admission, onlyAgent) {
    const refresh = admittedRealms.get(onlyAgent);
    if (refresh) {
        refresh();
        return;
    }
    const states = new WeakMap();
    const reconcileIdentity = (agent, role = policy.identity(agent).role) => {
        const state = states.get(agent);
        if (state === undefined || state.identityRole === role)
            return;
        state.identityPrompt?.();
        state.identityPrompt = role === undefined ? undefined : registerRoleHarnessIdentity(agent, role);
        state.identityRole = role;
    };
    const reconcile = (agent) => {
        const state = states.get(agent);
        if (state === undefined)
            return;
        const agentCtx = nativeAgentContext(agent);
        const raw = agentCtx.get("agentPresets")?.serviceFor({ ctx: agentCtx }, "tools");
        const tools = raw === undefined ? agentCtx.get("tools") : getTraceable(agentCtx, raw);
        if (tools === undefined)
            throw new Error("DSMM role tools require native guard/restrict services");
        const settings = getSettings(agent), identity = policy.identity(agent), targets = policy.targets(agent);
        const prompt = agentCtx.get("agentPresets")?.serviceFor(agent, "systemPrompt") ?? agentCtx.get("systemPrompt");
        const promptRealm = Reflect.get(prompt, symbols.original) ?? prompt;
        if (state.promptRealm !== promptRealm) {
            state.guidance?.();
            state.identityPrompt?.();
            state.identityRole = undefined;
            state.guidance = getTraceable(agentCtx, prompt).section({ name: "dsmm:delegation-identity", order: 49, text(context) {
                    if (context.scope !== agent && agentForScope(ctx, context.scope) !== agent)
                        return "";
                    const identity = policy.identity(agent), tools = states.get(agent)?.tools, settings = getSettings(agent);
                    if (identity.role === undefined)
                        return settings.locale === undefined ? "" : buildDsmmLocaleGuidance(settings);
                    const captured = capturedRoleInvocation(agent);
                    return buildDsmmAgentGuidance(settings, { scope: identity.child ? "child" : "root", tools: tools?.schemas(agent) ?? [],
                        delegation: tools === undefined ? [] : admittedCallableRoleInventory(agent, settings, policy, tools),
                        ...(captured === undefined ? {} : { invocation: roleInvocationObservation(captured, DSMM_ROLES.find(role => role.id === captured.target).name, "continuable", getSettings, agent, { childId: agent.id }) }),
                        runtimeAdmission: getSettings.subagentRuntime?.(), capabilities: { continuable: true, nativeChildDelivery: true,
                            ...(agentCtx.get("dsmmChildren") === undefined ? {} : { nativeBrowserPrompt: { surface: "conversation.dsmm-children" } }) } });
                } });
            state.promptRealm = promptRealm;
        }
        reconcileIdentity(agent, identity.role);
        const subagents = agentCtx.get("subagents");
        const host = ctx.get?.("tools");
        const names = [...hostControls, ...host?.schemas().map((row) => row.name).filter((name) => name.startsWith(`mcp__${settings.lsp.serverName}__`)) ?? []];
        const definitions = names.map((name) => host?.get(name));
        const signature = JSON.stringify([identity.role, targets, settings.subagents, targets.map((role) => [settings.roleRouting[role], subagents?.getProvider(roleProviderName(role))?.capabilities])]);
        const sameRealm = state.tools !== undefined && (Reflect.get(state.tools, symbols.original) ?? state.tools) === (Reflect.get(tools, symbols.original) ?? tools);
        const parentScope = scopeParentOf(agent);
        const sameParent = state.parentScope === parentScope;
        if (sameRealm && sameParent && signature === state.signature && definitions.length === state.hostDefinitions.length && definitions.every((definition, i) => definition === state.hostDefinitions[i]))
            return;
        for (const dispose of state.owned.splice(0))
            dispose();
        state.restriction?.();
        state.guard?.();
        state.tools = tools;
        // rc.2 has no public filter for own-layer registrations. A native monotonic
        // guard fences their invocation and exact definition identity instead.
        state.guard = tools.guard((execution) => execution.agent === agent ? policy.toolDenial(agent, execution.name, tools, execution) : undefined);
        const forbidden = tools.schemas(agent).map((tool) => tool.name).filter((name) => name !== "run_code" && policy.toolDenial(agent, name) !== undefined
            && tools.get(name, parentScope) === tools.get(name, agent));
        if (forbidden.length > 0)
            state.restriction = tools.restrict({ deny: forbidden });
        else
            state.restriction = undefined;
        for (const definition of definitions) {
            if (definition !== undefined && tools.get(definition.name, agent) === undefined && policy.toolDenial(agent, definition.name) === undefined)
                state.owned.push(tools.register(definition));
        }
        const inventory = callableRoleInventory(settings, targets.filter(role => subagents?.getProvider(roleProviderName(role))?.capabilities.depthLimit === true));
        for (const entry of inventory)
            state.owned.push(registerRoleTool(agent, agentCtx, tools, entry, getSettings, policy, admission));
        policy.captureTools(agent, tools, [...inventory.map(entry => entry.name), ...names], !sameRealm || !sameParent);
        state.signature = signature;
        state.hostDefinitions = definitions;
        state.parentScope = parentScope;
    };
    const onCreated = ({ agent }) => {
        if (states.has(agent) || admittedRealms.has(agent))
            return;
        if (!getSettings(agent).modules.deepwork.enabled)
            return;
        const agentCtx = nativeAgentContext(agent);
        policy.admit(agent);
        states.set(agent, { owned: [], hostDefinitions: [] });
        const retire = () => {
            stopIdentity();
            const state = states.get(agent);
            state?.restriction?.();
            state?.guard?.();
            state?.identityPrompt?.();
            state?.guidance?.();
            for (const dispose of state?.owned ?? [])
                dispose();
            states.delete(agent);
            admittedRealms.delete(agent);
            admission.lifetime.signal.removeEventListener("abort", retire);
        };
        admission.lifetime.signal.addEventListener("abort", retire, { once: true });
        agentCtx.effect(() => retire);
        reconcile(agent);
        admittedRealms.set(agent, () => reconcile(agent));
    };
    // Native assembly collects sections before its waterfall. Admission/mode/preset
    // changes must update the Agent layer before that collection begins.
    const stopIdentity = controller.watch(agent => { if (agent === onlyAgent)
        reconcile(agent); });
    onCreated({ agent: onlyAgent });
}
//# sourceMappingURL=role-subagents.js.map