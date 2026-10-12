import { isDeepStrictEqual } from "node:util";
import { symbols } from "@deepseek-ai/cordis";
import { createScope } from "@deepseek-ai/dsh-scope";
import { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { scopeLifetime } from "./delivery-authority.js";
import { createLegacyReadOperationCapability, LegacyChildToolPolicy } from "./legacy-child-policy.js";
import { createLegacyReadHost, createLegacyReadHostOwner, LegacyReadUnavailable } from "./legacy-read-host.js";
import { NativeChildEvidenceReader, legacyEvidenceFromNativeFacts } from "./native-child-evidence.js";
function assertReadArguments(args, binding) {
    if (args === null || typeof args !== "object" || Array.isArray(args))
        throw new LegacyReadUnavailable("arguments-unavailable");
    const row = args;
    if (Reflect.ownKeys(row).some(key => typeof key !== "string" || !["file_path", "offset", "limit"].includes(key))
        || typeof row.file_path !== "string" || !row.file_path.trim() || row.file_path.includes("\0")
        || [row.offset, row.limit].some(value => value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1))
        || typeof row.limit === "number" && row.limit > binding.caps.limit)
        throw new LegacyReadUnavailable("arguments-unavailable");
}
/** Explicit Host programmatic composition only. Owns glue, not a second permission, retry or audit service. */
export function createLegacyReadIntegration(options) {
    const { ctx, authority, authorityOwner, admissions, nativeHistory, trustedHostStartup: startup } = options;
    const coldCore = startup !== undefined && options.coreAdmissions !== undefined;
    if (coldCore) {
        if (authority.view().deliveryFenceReady)
            throw new LegacyReadUnavailable("lifetime-unavailable");
        if (typeof options.coreAdmissions.resolveOriginalChildEvidence !== "function" || typeof options.coreAdmissions.assertDelivery !== "function"
            || typeof options.proxyDefinitions?.admit !== "function" || typeof options.proxyDefinitions.assertAdmitted !== "function")
            throw new LegacyReadUnavailable("provenance-unavailable");
    }
    const children = new Map();
    const failedAttachments = new Map();
    const attachmentErrors = new WeakMap();
    const disposedChildren = new WeakSet();
    const capabilities = new WeakMap();
    const admissionGuards = new WeakMap();
    const retired = new WeakMap();
    const reader = new NativeChildEvidenceReader(ctx, ticket => assertTicket(ticket), nativeHistory);
    let serial = Promise.resolve();
    let pendingChanges = 0;
    let recoveryRequested = false;
    let disposal;
    const assertTicket = (ticket) => {
        authority.assertTicket(ticket);
        if (ticket.owner !== authorityOwner || ctx.agents.get(ticket.parent.id) !== ticket.parent || !Object.isFrozen(ticket.admission)) {
            throw new LegacyReadUnavailable("evidence-unavailable");
        }
    };
    const current = (parent, child, evidence, ticket) => {
        assertTicket(ticket);
        const resident = children.get(child);
        if (resident === undefined || resident.retired || resident.attachment.parent !== parent || resident.attachment.evidence !== evidence
            || admissions.childAdmission(child) !== resident.attachment.admission || child.session.header.parentSession !== parent.id
            || ctx.agents.get(child.id) !== child || !ctx.agents.isOwnedBy(child.id, parent))
            throw new LegacyReadUnavailable("evidence-unavailable");
        resident.lifetime.signal.throwIfAborted();
        options.proxyDefinitions.assertAdmitted(child, resident.attachment.proxy.definition);
        if (!ticket.admission.settings.modules.deepwork.enabled || !ticket.admission.settings.roles[evidence.role])
            throw new LegacyReadUnavailable("evidence-unavailable");
        admissions.assertCurrentParent(ticket, child, evidence);
        assertTicket(ticket);
        return resident;
    };
    const owner = createLegacyReadHostOwner({
        captureClosedComposition() {
            if (startup === undefined)
                return undefined;
            if ([startup.captureClosedComposition, startup.resolveReadBindings, startup.acquireCallContext, startup.reportAuditFault,
                startup.reportRetirementFault, startup.revoke].some(callback => typeof callback !== "function"))
                return undefined;
            const attachments = [...children.values()].filter(value => !value.retired).map(value => value.attachment);
            if (!attachments.length)
                return undefined;
            const snapshot = startup.captureClosedComposition(Object.freeze(attachments));
            if (snapshot === undefined)
                return undefined;
            if (!Array.isArray(snapshot.scopes) || !Array.isArray(snapshot.policies))
                throw new LegacyReadUnavailable("composition-unavailable");
            // The Host must close each actual child effective scope independently, not collapse them into one session entry.
            for (const attachment of attachments) {
                options.proxyDefinitions.assertAdmitted(attachment.child, attachment.proxy.definition);
                if (![attachment.policyScope, attachment.proxy.proxyScope, attachment.proxy.standingScope].every(scope => snapshot.scopes.some(row => row.ctx === scope.ctx))
                    || attachment.contributions.some(contribution => !snapshot.policies.some(row => row.scope === contribution.scope && row.reference === contribution.reference
                        && row.stage === contribution.stage && row.semantics === "audited-zero-or-once")))
                    throw new LegacyReadUnavailable("composition-unavailable");
            }
            return { ...snapshot, owner, bindings: attachments.map(value => value.bindings) };
        },
        acquireParentTicket(parent) { const ticket = authority.acquireParentTicket(parent); assertTicket(ticket); return ticket; },
        assertParentTicket(ticket) { assertTicket(ticket); },
        resolveChildAdmission(parent, child, evidence, ticket) {
            return current(parent, child, evidence, ticket).evidenceBinding;
        },
        resolveReadBindings(parent, child, lease) {
            const resident = current(parent, child, children.get(child).attachment.evidence, lease.ticket);
            if (startup?.resolveReadBindings(parent, child) !== resident.attachment.bindings)
                throw new LegacyReadUnavailable("provenance-unavailable");
            return resident.attachment.bindings;
        },
        async acquireCallContext(parent, child, exec, lease) {
            if (startup === undefined)
                throw new LegacyReadUnavailable("audit-unavailable");
            lease.signal.throwIfAborted();
            current(parent, child, children.get(child).attachment.evidence, lease.ticket);
            return startup.acquireCallContext(parent, child, exec, lease);
        },
        revoke(reason) {
            authority.revokeOwner(authorityOwner, reason);
            for (const resident of children.values())
                resident.lifetime.abort(reason);
            startup?.revoke(reason);
        },
        reportAuditFault(error, outcomes) { startup?.reportAuditFault(error, outcomes); },
    });
    const host = createLegacyReadHost(owner);
    const classifyTool = (name, tools, child) => {
        if (name !== "read") {
            const report = options.classifyChildReport?.(name, tools, child);
            return report?.kind === "child-report" ? report : undefined;
        }
        const resident = children.get(child);
        if (resident === undefined || resident.retired || resident.lifetime.signal.aborted)
            return undefined;
        return tools.get(name, child) === resident.attachment.proxy.definition ? capabilities.get(child) : undefined;
    };
    const legacyCapabilities = {
        classifyTool,
        onGuardInstalled(child, guard) {
            const previous = admissionGuards.get(child) ?? [];
            admissionGuards.set(child, Object.freeze([...previous, { side: "child", stage: "guard", scope: child.ctx,
                    reference: guard, order: 0, semantics: "audited-zero-or-once" }]));
        },
        assertParentReport(parent, child, args, definition, evidence) {
            const ticket = authority.acquireParentTicket(parent);
            assertTicket(ticket);
            const admission = admissions.childAdmission(child);
            if (!Object.isFrozen(admission) || admission.childEvidence?.mode !== "legacy-conservative" || ctx.agents.get(child.id) !== child
                || child.session.header.parentSession !== parent.id || !ctx.agents.isOwnedBy(child.id, parent)
                || !ticket.admission.settings.modules.deepwork.enabled || !ticket.admission.settings.roles[evidence.role])
                throw new LegacyReadUnavailable("evidence-unavailable");
            admissions.assertCurrentParent(ticket, child, evidence);
            const report = options.classifyChildReport?.("send_message", child.ctx.tools, child);
            if (report?.kind !== "child-report" || report.definition !== definition || child.ctx.tools.get("send_message", child) !== definition
                || args === null || typeof args !== "object" || args.agent_id !== parent.id)
                throw new LegacyReadUnavailable("evidence-unavailable");
            report.assertArguments(args);
            assertTicket(ticket);
        },
    };
    const enqueue = (work) => {
        pendingChanges++;
        const run = async () => {
            try {
                await work();
            }
            finally {
                pendingChanges--;
                if (pendingChanges === 0 && recoveryRequested && disposal === undefined && failedAttachments.size === 0) {
                    recoveryRequested = false;
                    if (host.composition.view().state !== "ready" && [...children.values()].some(value => !value.retired)) {
                        try {
                            host.publishCheckedGeneration();
                        }
                        catch (error) {
                            ctx.logger.warn("Legacy read attachment recovery could not attest the current composition", error);
                        }
                    }
                }
            }
        };
        const result = serial.then(run, run);
        serial = result.catch(() => { });
        return result;
    };
    const reportRetirementFault = (error, child) => {
        try {
            startup?.reportRetirementFault(error, child);
        }
        catch (reportError) {
            ctx.logger.warn("Legacy read retirement fault reporter failed", reportError);
        }
    };
    const releaseFailedAttachment = (child) => {
        const failed = failedAttachments.get(child);
        if (failed === undefined || failed.release !== undefined || !disposedChildren.has(child))
            return;
        failed.release = enqueue(async () => {
            await host.composition.closeForChange("failed-child-disposed");
            await host.releaseAfterChildDispose(child);
            await failed.policyScope.dispose();
            failedAttachments.delete(child);
        });
        void failed.release.then(failed.complete, error => { reportRetirementFault(error, child); failed.fail(error); });
    };
    const retire = (child, reason) => {
        const resident = children.get(child);
        if (resident === undefined)
            return failedAttachments.get(child)?.completion ?? retired.get(child) ?? Promise.resolve();
        if (resident.retirement !== undefined)
            return resident.retirement;
        resident.retired = true;
        resident.lifetime.abort(reason);
        authority.revokeParent(child, reason);
        const drain = host.composition.closeForChange(reason);
        const result = enqueue(async () => {
            await drain;
            await resident.disposed;
            await host.releaseAfterChildDispose(child);
            await resident.attachment.policyScope.dispose();
            children.delete(child);
            if (disposal === undefined && pendingChanges === 1 && [...children.values()].some(value => !value.retired))
                host.publishCheckedGeneration();
        });
        resident.retirement = result;
        retired.set(child, result);
        void result.catch(error => reportRetirementFault(error, child));
        return result;
    };
    ctx.on("agent/disposed", ({ agent }) => {
        disposedChildren.add(agent);
        releaseFailedAttachment(agent);
        const resident = children.get(agent);
        if (resident === undefined)
            return;
        resident.markDisposed();
        void retire(agent, "child-registry-disposed");
    }, { global: true });
    scopeLifetime(ctx, "dsmm.legacyRead: close Host operation leases", () => {
        void host.composition.closeForDispose("host-lifetime-ended");
    });
    const integration = {
        host,
        legacyCapabilities,
        /** B consumes this same classifier when validating the child report/tool definition. */
        classifyLegacyTool: classifyTool,
        view() {
            const raw = host.composition.view();
            const state = startup === undefined ? "off" : raw.state === "ready" ? "ready" : raw.state === "off" ? "off"
                : raw.state === "closed" && raw.activeCalls > 0 ? "quiescing" : "unavailable";
            return { state, operation: "read", activeCalls: raw.activeCalls, ...(raw.generation ? { generation: raw.generation } : {}),
                ...(startup === undefined ? { reason: "startup-opt-in-required" } : raw.reason === "audit-fault" ? { reason: "audit-unavailable" }
                    : state === "unavailable" && raw.state !== "disposed" ? { reason: "unknown-chain" } : {}) };
        },
        async attachChild(parent, child, signal) {
            signal.throwIfAborted();
            if (attachmentErrors.has(child))
                throw attachmentErrors.get(child);
            if (startup === undefined || disposal !== undefined || children.has(child))
                throw new LegacyReadUnavailable("composition-unavailable");
            if (typeof options.proxyDefinitions?.admit !== "function" || typeof options.proxyDefinitions.assertAdmitted !== "function")
                throw new LegacyReadUnavailable("provenance-unavailable");
            const drain = host.composition.closeForChange("child-attachment");
            let attachment;
            await enqueue(async () => {
                let policyScope, proxy, lifetime, detachLifetime;
                try {
                    await drain;
                    await host.composition.closeForChange("child-attachment");
                    signal.throwIfAborted();
                    if (attachmentErrors.has(child))
                        throw attachmentErrors.get(child);
                    if (disposal !== undefined || children.has(child))
                        throw new LegacyReadUnavailable("composition-unavailable");
                    const ticket = authority.acquireParentTicket(parent);
                    assertTicket(ticket);
                    const merged = AbortSignal.any([signal, ticket.signal]);
                    merged.throwIfAborted();
                    const evidence = await admissions.resolveOriginalChildEvidence(ticket, child.id, merged);
                    merged.throwIfAborted();
                    assertTicket(ticket);
                    if (!("mode" in evidence) || !evidence.toolFilter?.allow?.includes("read") || evidence.toolFilter.deny?.includes("read"))
                        throw new LegacyReadUnavailable("evidence-unavailable");
                    const facts = await reader.read(ticket, child.id, merged);
                    if (!isDeepStrictEqual(evidence, legacyEvidenceFromNativeFacts(facts)))
                        throw new LegacyReadUnavailable("evidence-unavailable");
                    const admission = admissions.childAdmission(child);
                    if (!Object.isFrozen(admission) || admission.childEvidence?.mode !== "legacy-conservative")
                        throw new LegacyReadUnavailable("evidence-unavailable");
                    const observation = await nativeHistory.observeSession(child.id, { signal: merged, projectionMode: "none" });
                    let physicalRecords;
                    try {
                        const own = observation.events.slice(observation.inheritedEventCount);
                        if (observation.header.id !== child.id || observation.header.parentSession !== parent.id || own.filter(event => event.type === "subagent/descriptor").length !== 1
                            || !isDeepStrictEqual(foldSubagentDescriptor(own), facts.descriptor))
                            throw new LegacyReadUnavailable("evidence-unavailable");
                        physicalRecords = Object.freeze([observation.header, ...own]);
                    }
                    finally {
                        observation[Symbol.dispose]();
                    }
                    merged.throwIfAborted();
                    assertTicket(ticket);
                    if (admissions.childAdmission(child) !== admission || ctx.agents.get(child.id) !== child || !ctx.agents.isOwnedBy(child.id, parent)
                        || !ticket.admission.settings.modules.deepwork.enabled || !ticket.admission.settings.roles[evidence.role])
                        throw new LegacyReadUnavailable("evidence-unavailable");
                    admissions.assertCurrentParent(ticket, child, evidence);
                    const bindings = typeof startup.resolveReadBindings === "function" ? startup.resolveReadBindings(parent, child) : undefined;
                    const original = (value) => value === undefined ? undefined : Reflect.get(value, symbols.original) ?? value;
                    if (bindings === undefined || bindings.parent !== parent || bindings.child !== child || parent.ctx.tools.get("read", parent) !== bindings.definition
                        || original(parent.ctx.get("fs")) !== original(bindings.parentFs) || original(child.ctx.get("fs")) !== original(bindings.childFs))
                        throw new LegacyReadUnavailable("provenance-unavailable");
                    merged.throwIfAborted();
                    assertTicket(ticket);
                    if (ctx.agents.get(child.id) !== child)
                        throw new LegacyReadUnavailable("evidence-unavailable");
                    lifetime = new AbortController();
                    const calls = new Map();
                    policyScope = createScope(child.ctx, child);
                    let markDisposed;
                    const disposed = new Promise(resolve => { markDisposed = resolve; });
                    // L owns a private token map; this guard lease authenticates the same full invocation without executing its body.
                    const pre = async (exec, next) => {
                        if (exec.agent !== child || exec.name !== "read")
                            return next();
                        let lease;
                        try {
                            lease = host.composition.acquireLease(parent, child, evidence, exec.signal);
                            calls.set(exec.token, lease);
                        }
                        catch {
                            return { kind: "deny", reason: "Legacy read requires the actual leased operation", info: { name: "LegacyReadUnavailable", code: "composition-unavailable" } };
                        }
                        const result = await next();
                        if (result.kind === "deny" || result.kind === "cancel")
                            return result;
                        lease.assertActive();
                        return result;
                    };
                    const finish = (exec) => { const lease = calls.get(exec.token); calls.delete(exec.token); lease?.release(); };
                    policyScope.ctx.on("tools/pre-execute", pre, { prepend: true });
                    policyScope.ctx.on("tools/result", finish);
                    const policy = new LegacyChildToolPolicy(evidence, parent, child, legacyCapabilities);
                    const guard = exec => exec.agent !== child || policy.denial(exec.name, exec.arguments, child.ctx.tools, exec) !== undefined
                        ? "Legacy capability requires original evidence and its real Host operation path" : undefined;
                    policyScope.ctx.tools.guard(guard);
                    proxy = host.attachChild(parent, child, evidence, bindings.definition);
                    const operation = createLegacyReadOperationCapability(proxy, exec => calls.get(exec.token));
                    const contributions = Object.freeze([
                        ...(admissionGuards.get(child) ?? []),
                        { side: "child", stage: "pre", scope: policyScope.ctx, reference: pre, order: 1, semantics: "audited-zero-or-once" },
                        { side: "child", stage: "guard", scope: policyScope.ctx, reference: guard, order: 1, semantics: "audited-zero-or-once" },
                        { side: "child", stage: "finalization", scope: policyScope.ctx, reference: finish, order: 1, semantics: "audited-zero-or-once" },
                        ...proxy.contributions.map(value => ({ side: "child", stage: value.stage, scope: value.scope.ctx, reference: value.reference,
                            order: value.stage === "pre" || value.stage === "around" ? -1 : value.order, semantics: "audited-zero-or-once" })),
                    ]);
                    attachment = Object.freeze({ parent, child, evidence, admission, bindings, proxy, policyScope, contributions });
                    const resident = { attachment, evidenceBinding: Object.freeze({ evidence, admission, source: "physical-old", physicalRecords,
                            childLifetime: lifetime.signal }), lifetime, disposed, markDisposed, retired: false };
                    await options.proxyDefinitions.admit(parent, child, proxy.definition);
                    options.proxyDefinitions.assertAdmitted(child, proxy.definition);
                    merged.throwIfAborted();
                    assertTicket(ticket);
                    if (admissions.childAdmission(child) !== admission || ctx.agents.get(child.id) !== child || !ctx.agents.isOwnedBy(child.id, parent))
                        throw new LegacyReadUnavailable("evidence-unavailable");
                    admissions.assertCurrentParent(ticket, child, evidence);
                    merged.throwIfAborted();
                    assertTicket(ticket);
                    detachLifetime = scopeLifetime(child.ctx, "dsmm.legacyRead: retire exact child operation path", () => {
                        resident.lifetime.abort("child-lifetime-ended");
                        if (children.get(child) === resident)
                            void retire(child, "child-lifetime-ended");
                    });
                    merged.throwIfAborted();
                    assertTicket(ticket);
                    lifetime.signal.throwIfAborted();
                    capabilities.set(child, Object.freeze({ kind: "read", definition: proxy.definition, operation, assertArguments: (args) => assertReadArguments(args, bindings) }));
                    children.set(child, resident);
                }
                catch (error) {
                    lifetime?.abort(error);
                    if (detachLifetime !== undefined) {
                        try {
                            detachLifetime();
                        }
                        catch (cleanupError) {
                            reportRetirementFault(cleanupError, child);
                        }
                    }
                    // The failed proxy is no longer a residency. L's Host slot/standing deny can retire only after actual disposal.
                    if (proxy !== undefined) {
                        capabilities.delete(child);
                        if (children.get(child)?.attachment.proxy === proxy)
                            children.delete(child);
                        attachmentErrors.set(child, error);
                        let complete, fail;
                        const completion = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
                        const failed = { policyScope: policyScope, completion, complete, fail };
                        failedAttachments.set(child, failed);
                        retired.set(child, completion);
                        void completion.catch(() => { });
                        try {
                            await proxy.removeProxy();
                        }
                        catch (cleanupError) {
                            reportRetirementFault(cleanupError, child);
                        }
                        releaseFailedAttachment(child);
                    }
                    if (policyScope !== undefined) {
                        try {
                            await policyScope.dispose();
                        }
                        catch (cleanupError) {
                            reportRetirementFault(cleanupError, child);
                        }
                    }
                    if (host.composition.view().generation !== undefined)
                        recoveryRequested = true;
                    throw error;
                }
            });
            return attachment;
        },
        publishCheckedGeneration() {
            if (pendingChanges)
                throw new LegacyReadUnavailable("composition-unavailable");
            host.publishCheckedGeneration();
        },
        /** Close synchronously; mutate only after real pipelines AND audit leases have drained. */
        change(reason, mutate) {
            const drain = host.composition.closeForChange(reason);
            return enqueue(async () => {
                await drain;
                await host.composition.closeForChange(reason);
                if (disposal !== undefined)
                    throw new LegacyReadUnavailable("lifetime-unavailable");
                await mutate();
                if (pendingChanges === 1)
                    host.publishCheckedGeneration();
            });
        },
        async removeProxy(child) {
            const drain = host.composition.closeForChange("proxy-removal");
            await enqueue(async () => {
                await drain;
                await host.composition.closeForChange("proxy-removal");
                const resident = children.get(child);
                if (resident !== undefined)
                    await resident.attachment.proxy.removeProxy();
            });
        },
        /** Opaque native holders call before beginning disposal; ordinary residency teardown also retires automatically. */
        async revokeChildBeforeDispose(child, nativeDispose) {
            const retirement = retire(child, "holder-disposed");
            await host.composition.closeForChange("holder-disposed");
            await nativeDispose();
            await retirement;
        },
        whenChildRetired(child) {
            const resident = children.get(child);
            return resident?.retirement ?? retired.get(child) ?? (resident === undefined ? Promise.resolve() : resident.disposed.then(() => resident.retirement));
        },
        dispose(nativeDrain) {
            if (disposal === undefined)
                disposal = host.dispose(async () => {
                    await nativeDrain();
                    for (const resident of children.values())
                        await resident.attachment.policyScope.dispose();
                });
            return disposal;
        },
    };
    const core = !coldCore ? undefined : Object.freeze({
        legacyCapabilities,
        classifyLegacyTool: classifyTool,
        resolveOriginalChildEvidence: options.coreAdmissions.resolveOriginalChildEvidence.bind(options.coreAdmissions),
        assertLegacyDelivery(ticket, childId, evidence) {
            ticket.signal.throwIfAborted();
            const parent = ticket.parent.id === undefined ? undefined : ctx.agents.get(SessionId(ticket.parent.id));
            if (parent === undefined || parent !== ticket.parent)
                throw new LegacyReadUnavailable("evidence-unavailable");
            const issued = authority.acquireParentTicket(parent);
            assertTicket(issued);
            if (ticket.owner !== authorityOwner || ticket.admission !== issued.admission || ticket.parentEpoch !== issued.parentEpoch
                || evidence.parentSessionId !== parent.id || evidence.childSessionId !== childId)
                throw new LegacyReadUnavailable("evidence-unavailable");
            options.coreAdmissions.assertDelivery(ticket, childId, evidence);
            ticket.signal.throwIfAborted();
            assertTicket(issued);
        },
        async afterChildAdmission(parent, child, signal) {
            const admission = admissions.childAdmission(child);
            if (!Object.isFrozen(admission))
                throw new LegacyReadUnavailable("evidence-unavailable");
            if (admission.childEvidence?.mode !== "legacy-conservative")
                return undefined;
            const ticket = authority.acquireParentTicket(parent);
            assertTicket(ticket);
            const merged = AbortSignal.any([signal, ticket.signal]);
            merged.throwIfAborted();
            const evidence = await admissions.resolveOriginalChildEvidence(ticket, child.id, merged);
            merged.throwIfAborted();
            assertTicket(ticket);
            // This decides enrollment only. A + physical history, exact definitions and L's real operation lease still prove the read.
            if (!("mode" in evidence) || !evidence.toolFilter?.allow?.includes("read") || evidence.toolFilter.deny?.includes("read"))
                return undefined;
            const attachment = await integration.attachChild(parent, child, merged);
            // Concurrent serial-created admissions share the existing Host change queue and publish one closed cohort.
            while (pendingChanges)
                await serial;
            merged.throwIfAborted();
            if (children.get(child)?.retired || child.ctx.tools.get("read", child) !== attachment.proxy.definition)
                throw new LegacyReadUnavailable("lifetime-unavailable");
            if (host.composition.view().state !== "ready")
                integration.publishCheckedGeneration();
            return attachment;
        },
        publishCheckedGeneration: integration.publishCheckedGeneration,
        changeConfiguration: integration.change,
        async revokeBeforeDispose(agent, nativeDrainAndDispose) {
            authority.revokeParent(agent, "holder-disposed");
            const retiring = [...children.values()].filter(value => value.attachment.child === agent || value.attachment.parent === agent
                || ctx.agents.isOwnedBy(value.attachment.child.id, agent)).map(value => retire(value.attachment.child, "holder-disposed"));
            await host.composition.closeForChange("holder-disposed");
            await nativeDrainAndDispose();
            await Promise.all(retiring);
        },
        dispose: integration.dispose,
    });
    return { ...integration, core };
}
//# sourceMappingURL=legacy-read-integration.js.map