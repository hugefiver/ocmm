import { randomUUID } from "node:crypto";
import { scopeLifetime } from "./lifetime.js";
import { PermissionRefusal, permissionOriginal } from "./permission-control.js";
import { DSMM_ROLES } from "./roles.js";
import { classifyDsmmAgent } from "./runtime-integration.js";
function sameFacts(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}
/** Live Core admissions and native realm facts; the calling fiber owns every observer. */
export function createCorePermissionAuthority(ctx, options) {
    const { getSettings, rolePolicy } = options;
    const coreOwner = ctx.fiber.ctx;
    const lifetime = new AbortController();
    const lifetimeSignal = AbortSignal.any([lifetime.signal, options.signal]);
    const generations = new Map();
    const physicalLifetimes = new WeakMap();
    const revokeAll = () => { for (const generation of [...generations.values()])
        generation.revoke(); };
    scopeLifetime(ctx, "dsmm.permissionAuthority: release live generations", () => { lifetime.abort(); revokeAll(); });
    ctx.on("agent/disposed", ({ agent }) => generations.get(agent)?.revoke(), { global: true, prepend: true });
    const integration = () => {
        if (lifetimeSignal.aborted)
            throw new PermissionRefusal("cancelled");
        return ctx.get("dsmmNativeAdmission");
    };
    /** Registry ownership is direct, so each physical edge must be walked independently. */
    const ancestry = (exec) => {
        const agents = ctx.get("agents"), agent = exec.agent;
        const realmAgents = agent?.ctx.get("agents");
        if (agents === undefined || agent === undefined || agents.get(agent.id) !== agent
            || realmAgents === undefined || permissionOriginal(realmAgents) !== permissionOriginal(agents))
            throw new PermissionRefusal("not-owned");
        const chain = [], seen = new Set(), residents = agents.list();
        let current = agent;
        while (true) {
            if (seen.has(current) || agents.get(current.id) !== current)
                throw new PermissionRefusal("not-owned");
            seen.add(current);
            chain.push(current);
            const owners = residents.filter(candidate => candidate !== current && agents.isOwnedBy(current.id, candidate));
            if (owners.length === 0) {
                if (!agents.roots().includes(current) || current.session.header.origin === "subagent")
                    throw new PermissionRefusal("not-owned");
                return chain;
            }
            if (owners.length !== 1 || current.session.header.parentSession !== owners[0].id)
                throw new PermissionRefusal("not-owned");
            current = owners[0];
        }
    };
    const coreAdmission = (agent) => {
        const core = ctx.get("dsmmCoreLlmOwner"), profiles = ctx.get("dsmmProfileRuntime");
        const ownerCore = coreOwner.get("dsmmCoreLlmOwner"), realmCore = agent.ctx.get("dsmmCoreLlmOwner");
        if (core === undefined || ownerCore === undefined || realmCore === undefined || profiles === undefined
            || permissionOriginal(core) !== permissionOriginal(ownerCore) || permissionOriginal(core) !== permissionOriginal(realmCore))
            throw new PermissionRefusal("unavailable");
        const structural = agent, admission = getSettings.admission?.(structural);
        if (admission === undefined || profiles.admission(structural) !== admission || getSettings(structural) !== admission.settings)
            throw new PermissionRefusal("stale");
        return admission;
    };
    const local = (host, agent, root, parent) => {
        const previous = generations.get(agent);
        try {
            const structural = agent;
            const nativeChild = parent !== undefined && !parent.controlled && classifyDsmmAgent(agent) === "native";
            if (!nativeChild)
                rolePolicy.assertModuleAdmission(structural);
            // Ordinary native children borrow the actual parent's Core policy domain,
            // while retaining their own native realm, restrictions and lifetime.
            const admission = nativeChild ? parent.admission : coreAdmission(agent);
            const identity = nativeChild ? undefined : rolePolicy.identity(structural);
            const tools = agent.ctx.get("tools"), approval = agent.ctx.get("approval");
            if (tools === undefined || !nativeChild && (identity?.epoch !== admission.epoch
                || (parent === undefined ? agent !== root || identity.child : identity.parent !== parent.authority.agent || !identity.child)))
                throw new PermissionRefusal("not-owned");
            const nativePolicy = approval === undefined ? undefined : approval.overrideOf(agent.session) ?? approval.config.policy;
            if (approval !== undefined && nativePolicy !== "ask" && nativePolicy !== "never")
                throw new PermissionRefusal("unavailable");
            const managed = parent !== undefined && !nativeChild;
            if (managed && host === undefined)
                throw new PermissionRefusal("unavailable");
            const entry = managed ? permissionOriginal(host) : undefined;
            const owner = managed ? host : coreOwner;
            const facts = [root, agent.ctx, parent?.authority.signal, permissionOriginal(ctx.get("dsmmCoreLlmOwner")),
                permissionOriginal(ctx.get("dsmmProfileRuntime")), permissionOriginal(tools),
                approval === undefined ? undefined : permissionOriginal(approval),
                admission.settings, nativeChild, identity?.role, identity?.child, identity?.parent, identity?.epoch, identity?.readOnly,
                JSON.stringify(identity?.toolFilter)];
            if (previous !== undefined && !previous.authority.signal.aborted && previous.integration === entry
                && previous.authority.owner === owner && previous.admission === admission && sameFacts(previous.facts, facts)) {
                if (managed)
                    host.assert(agent);
                return previous;
            }
            previous?.revoke();
            if (managed && host.assert(agent) !== admission)
                throw new PermissionRefusal("not-owned");
            const controller = new AbortController();
            const signal = AbortSignal.any([controller.signal, lifetimeSignal, ...parent === undefined ? [] : [parent.authority.signal]]);
            const detach = [];
            let revoked = false;
            const generation = { nativeChild, controlled: managed || identity?.role !== undefined, integration: entry, admission, facts,
                authority: Object.freeze({ agent, root, realm: agent.ctx, owner, ownerGeneration: admission.epoch,
                    admissionRevision: admission.epoch, permissionRevision: randomUUID(), signal }),
                revoke() {
                    if (revoked)
                        return;
                    revoked = true;
                    controller.abort();
                    if (generations.get(agent) === generation)
                        generations.delete(agent);
                    for (const dispose of detach)
                        dispose();
                } };
            generations.set(agent, generation);
            const revoke = () => generation.revoke();
            signal.addEventListener("abort", revoke, { once: true });
            detach.push(() => signal.removeEventListener("abort", revoke));
            try {
                detach.push(scopeLifetime(agent.ctx, "dsmm.permissionAuthority: exact Agent realm lifetime", revoke));
                if (signal.aborted)
                    throw new PermissionRefusal("cancelled");
                return generation;
            }
            catch (error) {
                generation.revoke();
                throw error;
            }
        }
        catch (error) {
            previous?.revoke();
            throw error;
        }
    };
    const current = exec => {
        const host = integration(), chain = ancestry(exec), root = chain.at(-1);
        let parent, generation;
        for (const agent of [...chain].reverse()) {
            generation = local(host, agent, root, parent);
            if (agent !== exec.agent)
                parent = generation;
        }
        return generation.authority;
    };
    const authority = {
        current,
        captureIntegrity(exec) {
            const chain = ancestry(exec), realms = chain.map(agent => agent.ctx);
            const signals = chain.map(agent => {
                let signal = physicalLifetimes.get(agent);
                if (signal === undefined) {
                    const controller = new AbortController();
                    signal = controller.signal;
                    physicalLifetimes.set(agent, signal);
                    scopeLifetime(agent.ctx, "dsmm.permissionIntegrity: physical Agent lifetime", () => controller.abort());
                }
                return signal;
            });
            const signal = AbortSignal.any([lifetimeSignal, ...signals]);
            return { signal, assertCurrent() {
                    if (exec.signal.aborted || signal.aborted)
                        throw new PermissionRefusal("cancelled");
                    const live = ancestry(exec);
                    if (live.length !== chain.length || live.some((agent, index) => agent !== chain[index] || agent.ctx !== realms[index]))
                        throw new PermissionRefusal("not-owned");
                } };
        },
        rootCurrent(root, exec) {
            const host = integration(), chain = ancestry(exec);
            const agents = ctx.get("agents");
            if (chain.at(-1) !== root || agents?.get(root.id) !== root || !agents.roots().includes(root))
                throw new PermissionRefusal("not-owned");
            const generation = local(host, root, root);
            if (root.ctx.get("approval") === undefined)
                throw new PermissionRefusal("unavailable");
            return generation.authority;
        },
        assertCurrent(authority, exec) {
            if (exec.signal.aborted || authority.signal.aborted)
                throw new PermissionRefusal("cancelled");
            const live = current(exec);
            if (authority.agent !== live.agent || authority.root !== live.root || authority.realm !== live.realm || authority.owner !== live.owner
                || authority.ownerGeneration !== live.ownerGeneration || authority.admissionRevision !== live.admissionRevision
                || authority.permissionRevision !== live.permissionRevision || authority.signal !== live.signal)
                throw new PermissionRefusal("stale");
            const tools = live.agent.ctx.get("tools");
            if (tools?.get(exec.name, live.agent) === undefined
                || !generations.get(live.agent)?.nativeChild && rolePolicy.toolDenial(live.agent, exec.name, tools, exec) !== undefined)
                throw new PermissionRefusal("denied");
        },
    };
    return { authority,
        assertWritable(root) {
            if (lifetimeSignal.aborted)
                throw new PermissionRefusal("cancelled");
            const agents = ctx.get("agents"), realmAgents = root.ctx.get("agents");
            if (agents === undefined || realmAgents === undefined || permissionOriginal(agents) !== permissionOriginal(realmAgents)
                || agents.get(root.id) !== root || root.session.id !== root.id || !agents.roots().includes(root)
                || root.session.header.origin === "subagent" || agents.list().some(agent => agent !== root && agents.isOwnedBy(root.id, agent)))
                throw new PermissionRefusal("not-owned");
            const seen = new Set();
            for (let fiber = root.ctx.fiber; !seen.has(fiber.ctx); fiber = fiber.parent.fiber) {
                if (fiber.uid === null || fiber.state === 4 || fiber.state === 5)
                    throw new PermissionRefusal("cancelled");
                seen.add(fiber.ctx);
            }
            const structural = root, admission = coreAdmission(root);
            const identity = rolePolicy.identity(structural);
            if (identity.child || identity.parent !== undefined || identity.epoch !== admission.epoch)
                throw new PermissionRefusal("not-owned");
            if (identity.readOnly === true || DSMM_ROLES.find(role => role.id === identity.role)?.access === "read-only")
                throw new PermissionRefusal("denied");
            const sandbox = root.ctx.get("sandboxPolicy");
            if (sandbox === undefined)
                throw new PermissionRefusal("unavailable");
            const policy = sandbox.resolve({ session: root.session });
            if (policy.mode === "read-only")
                throw new PermissionRefusal("denied");
            if (policy.mode !== "workspace-write" && policy.mode !== "danger-full-access")
                throw new PermissionRefusal("unavailable");
        },
    };
}
//# sourceMappingURL=core-permission-authority.js.map