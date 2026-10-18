import { AsyncLocalStorage } from "node:async_hooks";
import { symbols } from "@deepseek-ai/cordis";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import { TOOL_ABORTED } from "@deepseek-ai/dsh-tools";
import { PermissionRefusal, permissionOutcome } from "./permission-errors.js";
import { nativeStandingFullAccess } from "./permission-native-access.js";
export { PermissionRefusal } from "./permission-errors.js";
export function permissionOriginal(value) { return Reflect.get(value, symbols.original) ?? value; }
/** Explicitly audited DSMM approval adapters retain identity through the patched dispatcher. */
export function permissionApprovalAdapter(ctx, listener) {
    const approval = ctx.get("approval"), factory = approval && Reflect.get(approval, "createForwarder");
    if (typeof factory !== "function")
        return listener;
    return Reflect.apply(factory, approval, [listener]);
}
export function isSandboxWidening(requested, standing) {
    return standing === "read-only" || standing === "workspace-write" && requested === "danger-full-access";
}
/** Permission admission precedes native approval; subsequent checks enforce execution integrity only. */
export class PermissionControl {
    ctx;
    collaborators;
    lifetime = new AbortController();
    bindings = new Map();
    requests = new WeakMap();
    execution = new AsyncLocalStorage();
    constructor(ctx, collaborators) {
        this.ctx = ctx;
        this.collaborators = collaborators;
    }
    async compose(exec, registration, entry, action, next, cwd) {
        const nativeOnly = nativeStandingFullAccess(this.ctx, exec.agent);
        const authority = nativeOnly ? undefined : this.collaborators.current(exec);
        if (authority !== undefined) {
            registration.assertCurrent?.(exec);
            this.collaborators.assertCurrent(authority, exec);
        }
        const agent = exec.agent, realm = agent?.ctx;
        const integrity = this.collaborators.captureIntegrity?.(exec) ?? { assertCurrent: () => {
                if (agent !== undefined && (this.ctx.agents.get(agent.id) !== agent || agent.ctx !== realm))
                    throw new PermissionRefusal("not-owned");
                if (authority === undefined)
                    return;
                const current = this.collaborators.current(exec);
                if (current.agent !== authority.agent || current.root !== authority.root || current.realm !== authority.realm
                    || current.owner !== authority.owner || current.ownerGeneration !== authority.ownerGeneration)
                    throw new PermissionRefusal("not-owned");
            } };
        const args = exec.arguments;
        const officialMode = !nativeOnly && (args.sandbox_permissions === "workspace-write" || args.sandbox_permissions === "danger-full-access") ? args.sandbox_permissions : undefined;
        const standing = registration.standingMode(exec);
        const target = officialMode ?? (entry === undefined ? undefined : isSandboxWidening(entry.sandboxMode, standing) ? entry.sandboxMode : standing ?? entry.sandboxMode);
        const reason = `DSMM command: ${String(args.command)}\nWorking directory: ${cwd}\nSandbox mode: ${target ?? "native standing policy"}. ${target === "danger-full-access" ? "Command execution may write outside the workspace to any OS-permitted location; this is not a cache-only or path-whitelist grant." : "Exact native tool invocation under the stated native sandbox policy."}`;
        const lifetime = new AbortController();
        const binding = { exec, args: exec.arguments, agent: exec.agent, callId: exec.callId, name: exec.name,
            registration, root: authority?.root, integrity, entry, officialMode,
            target: target === "workspace-write" || target === "danger-full-access" ? target : undefined,
            reason, ask: action === "ask" || entry?.mode === "ask", lifetime,
            signal: AbortSignal.any([exec.signal, lifetime.signal, this.lifetime.signal,
                ...integrity.signal === undefined ? [] : [integrity.signal], ...registration.signal === undefined ? [] : [registration.signal]]),
            entered: false, nativeRequest: false };
        this.checkIntegrity(binding);
        this.bindings.set(exec.token, binding);
        const downstream = await next();
        if (exec.signal.aborted)
            return { kind: "cancel" };
        this.checkIntegrity(binding);
        if (downstream.kind === "deny" || downstream.kind === "cancel")
            return downstream;
        if (nativeOnly)
            return downstream;
        const needsAsk = downstream.kind === "ask" || binding.ask && (entry === undefined || officialMode !== undefined);
        if (!needsAsk)
            return downstream;
        const reasons = [downstream.kind === "ask" ? downstream.reason : undefined, reason].filter(Boolean).join("\n");
        const displayReason = Object.freeze({ en: reasons, zh: reasons,
            ...downstream.kind === "ask" && downstream.displayReason !== undefined ? Object.fromEntries(Object.entries(downstream.displayReason).map(([locale, text]) => [locale, `${text}\n${reason}`])) : {} });
        if (binding.target === undefined)
            return { kind: "ask", reason: reasons, displayReason };
        const approval = registration.approval();
        if (approval === undefined || exec.agent === undefined)
            return { kind: "deny", reason: "Native approval is unavailable for this command." };
        const outcome = await approval.request({ agent: exec.agent, callId: exec.callId, toolName: exec.name,
            reason: reasons, displayReason, signal: binding.signal });
        if (exec.signal.aborted)
            return { kind: "cancel" };
        this.checkIntegrity(binding);
        if (outcome !== "allowed-once")
            return { kind: "deny", reason: `Native command approval ${outcome}.` };
        binding.approvedTarget = binding.target;
        return { kind: "allow" };
    }
    checkIntegrity(binding) {
        if (binding.signal.aborted || binding.exec.signal.aborted)
            throw new HarnessError("Permission-controlled call cancelled.", TOOL_ABORTED);
        const { exec, registration } = binding;
        if (exec.arguments !== binding.args || exec.agent !== binding.agent || exec.callId !== binding.callId || exec.name !== binding.name
            || !registration.active || !registration.unchanged() || registration.definition.execute !== registration.body
            || this.ctx.tools.get(binding.name, binding.agent) !== registration.registered)
            throw new PermissionRefusal("stale");
        binding.integrity.assertCurrent();
    }
    guard(exec) {
        const binding = this.bindings.get(exec.token);
        if (binding === undefined)
            return undefined;
        try {
            this.checkIntegrity(binding);
            return undefined;
        }
        catch {
            return "Native command execution identity is no longer current.";
        }
    }
    async answerer(request, next) {
        const owned = this.requests.get(request);
        if (owned === undefined)
            return next();
        this.checkIntegrity(owned.binding);
        return owned.allow ? "allowed-once" : permissionOutcome(next, owned.binding.signal, "cancelled");
    }
    async run(exec, args, registration, body) {
        const binding = this.bindings.get(exec.token);
        if (binding === undefined || binding.registration !== registration || binding.entered || args !== binding.args)
            throw new PermissionRefusal("stale");
        binding.signal = AbortSignal.any([binding.signal, exec.signal]);
        this.checkIntegrity(binding);
        binding.entered = true;
        try {
            if (binding.entry !== undefined && binding.officialMode === undefined && !nativeStandingFullAccess(this.ctx, exec.agent)) {
                if (binding.approvedTarget === undefined) {
                    const approval = registration.approval();
                    if (approval === undefined || exec.agent === undefined)
                        throw new PermissionRefusal("unavailable");
                    const request = { agent: exec.agent, toolName: exec.name, callId: exec.callId, signal: binding.signal, reason: binding.reason };
                    const outcome = await this.request(binding, request, approval, binding.entry.mode === "allow" && !binding.ask);
                    if (outcome === "cancelled")
                        throw new HarnessError("Native permission request cancelled.", TOOL_ABORTED);
                    if (outcome !== "allowed-once")
                        throw new PermissionRefusal(outcome === "unavailable" ? "unavailable" : "denied");
                    binding.approvedTarget = binding.target;
                }
                binding.mode = binding.approvedTarget;
            }
            return await this.execution.run(binding, () => body(binding.signal));
        }
        finally {
            this.finish(binding.exec);
        }
    }
    async request(binding, request, service, allow) {
        this.requests.set(request, { binding, allow });
        try {
            const result = await service.request(request);
            this.checkIntegrity(binding);
            return result;
        }
        finally {
            this.requests.delete(request);
        }
    }
    /** Scoped original native body; a target fact is consumed only for its exact official request. */
    async nativeApproval(request, service) {
        const binding = this.execution.getStore();
        if (binding === undefined || binding.officialMode === undefined || binding.nativeRequest || request.agent !== binding.agent
            || request.callId !== binding.callId || request.toolName !== binding.registration.definition.name || request.signal !== binding.signal)
            return service.request(request);
        this.checkIntegrity(binding);
        binding.nativeRequest = true;
        if (binding.approvedTarget === binding.officialMode) {
            binding.approvedTarget = undefined;
            return "allowed-once";
        }
        const actual = { ...request, reason: [request.reason, binding.reason].filter(Boolean).join("\n") };
        const covers = binding.entry !== undefined && (binding.entry.sandboxMode === "danger-full-access" || binding.officialMode === "workspace-write");
        return this.request(binding, actual, service, covers && binding.entry.mode === "allow" && !binding.ask);
    }
    approvedTarget(exec) {
        const binding = this.bindings.get(exec.token);
        if (binding === undefined)
            return undefined;
        this.checkIntegrity(binding);
        return binding.approvedTarget;
    }
    sandboxMode() {
        const binding = this.execution.getStore();
        if (binding === undefined || binding.mode === undefined)
            return undefined;
        this.checkIntegrity(binding);
        const mode = binding.mode;
        binding.mode = undefined;
        binding.approvedTarget = undefined;
        return mode;
    }
    finish(exec) {
        const binding = this.bindings.get(exec.token);
        if (binding !== undefined) {
            binding.mode = undefined;
            binding.approvedTarget = undefined;
            binding.lifetime.abort();
        }
        this.bindings.delete(exec.token);
    }
    revokePolicy() { }
    revokeRegistration(registration) { registration.active = false; }
    revokeAgent(agent) { for (const binding of this.bindings.values())
        if (binding.agent === agent || binding.root === agent)
            this.finish(binding.exec); }
    retire() { this.lifetime.abort(); for (const binding of this.bindings.values())
        this.finish(binding.exec); }
}
//# sourceMappingURL=permission-control.js.map