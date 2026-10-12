import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { HarnessError, ToolCallId } from "@deepseek-ai/dsh-llm";
import { createScope } from "@deepseek-ai/dsh-scope";
import { assertLegacyReadBindings } from "./legacy-read-composition.js";
import { isLegacyReadCallLease, LegacyReadUnavailable } from "./legacy-read-contracts.js";
export function installLegacyReadProxy(composition, parent, child, evidence, nativeDefinition) {
    if (["ready", "disposed"].includes(composition.view().state) || composition.view().activeCalls)
        throw new LegacyReadUnavailable("composition-unavailable");
    if (nativeDefinition.name !== "read" || parent.ctx.tools.get("read", parent) !== nativeDefinition)
        throw new LegacyReadUnavailable("provenance-unavailable");
    const standingScope = createScope(child.ctx, child);
    const proxyScope = createScope(child.ctx, child);
    const calls = new Map();
    let removed = false;
    const openTurnStart = (agent) => agent.ctx.get("sessionProjections")?.stateOf(agent.session, "turnBoundary")?.openTurnStartSeq;
    const assertContext = (call) => {
        const context = call.context;
        if (context === undefined)
            throw new LegacyReadUnavailable("audit-unavailable");
        context.assertAvailable();
        if (context.approval.kind !== call.lease.approval)
            throw new LegacyReadUnavailable("approval-unavailable");
        if (context.approval.kind === "coordinated-turn") {
            const approval = context.approval;
            if (approval.turn.parent !== parent || openTurnStart(parent) == null || approval.turn.openTurnStartSeq !== openTurnStart(parent)
                || approval.signal.aborted)
                throw new LegacyReadUnavailable("approval-unavailable");
            if (approval.childTurn !== undefined && (approval.childTurn.child !== child || openTurnStart(child) == null
                || approval.childTurn.openTurnStartSeq !== openTurnStart(child) || approval.childTurn.signal.aborted))
                throw new LegacyReadUnavailable("approval-unavailable");
        }
    };
    const callSignal = (exec, call) => AbortSignal.any([exec.signal, call.lease.signal,
        ...(call.context === undefined ? [] : [call.context.signal]),
        ...(call.context?.approval.kind === "coordinated-turn" ? [call.context.approval.signal,
            ...(call.context.approval.childTurn === undefined ? [] : [call.context.approval.childTurn.signal])] : [])]);
    const definition = {
        name: "read", description: nativeDefinition.description, parameters: nativeDefinition.parameters,
        output: { schema: nativeDefinition.output.schema, render: (args, value) => nativeDefinition.output.render(args, value) },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const call = calls.get(exec.token);
            if (call === undefined || call.invoked || removed)
                throw new LegacyReadUnavailable("lifetime-unavailable");
            call.invoked = true;
            const { lease } = call;
            lease.assertActive();
            assertContext(call);
            const signal = callSignal(exec, call);
            signal.throwIfAborted();
            const binding = composition.owner.resolveReadBindings(parent, child, lease);
            assertLegacyReadBindings(lease, binding);
            if (args === null || typeof args !== "object" || Array.isArray(args))
                throw new LegacyReadUnavailable("arguments-unavailable");
            const row = args;
            if (Reflect.ownKeys(row).some(key => !["file_path", "offset", "limit"].includes(String(key)))
                || typeof row.file_path !== "string" || !row.file_path.trim() || row.file_path.includes("\0")
                || [row.offset, row.limit].some(value => value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1))
                || (typeof row.limit === "number" && row.limit > binding.caps.limit))
                throw new LegacyReadUnavailable("arguments-unavailable");
            const target = await binding.childFs.resolve(row.file_path, { cwd: child.session.header.cwd, signal });
            lease.assertActive();
            signal.throwIfAborted();
            const hostPath = binding.childFs.processPath(target);
            const mapped = binding.parentFs.processPathFromHostPath(hostPath);
            if (!isAbsolute(hostPath) || mapped === undefined || !isAbsolute(mapped))
                throw new LegacyReadUnavailable("target-unavailable");
            const parentTarget = await binding.parentFs.resolve(mapped, { cwd: parent.session.header.cwd, signal });
            lease.assertActive();
            signal.throwIfAborted();
            if (target.targetKey === undefined || target.targetKey !== parentTarget.targetKey)
                throw new LegacyReadUnavailable("target-unavailable");
            assertLegacyReadBindings(lease, composition.owner.resolveReadBindings(parent, child, lease));
            assertContext(call);
            signal.throwIfAborted();
            const callId = ToolCallId(`legacy-read:${randomUUID()}`);
            call.parentExecution = { callId, rootCallId: exec.rootCallId, parent: exec.token };
            const result = await parent.ctx.tools.execute({ agent: parent, name: "read", arguments: { ...row, file_path: mapped },
                parent: exec.token, rootCallId: exec.rootCallId, callId, signal });
            call.parentResult = result;
            // Native execution has already settled. Never reclassify it using a newer epoch.
            if (result.isError) {
                const error = new HarnessError(result.error.message, result.error.info?.code ?? "LEGACY_READ_FAILED");
                if (result.error.info !== undefined)
                    error.name = result.error.info.name;
                call.transport = { isError: true, error: { message: error.message, info: { name: error.name, code: error.code } },
                    content: [{ type: "text", text: `Error: ${error.message}` }] };
                throw error;
            }
            if (result.concludesTurn)
                exec.concludeTurn();
            call.transport = { isError: false, value: result.value, content: definition.output.render(args, result.value),
                ...(result.concludesTurn ? { concludesTurn: true } : {}) };
            return result.value;
        },
        projectContent(exec, result) {
            const call = calls.get(exec.token);
            // This runs BEFORE child post policy, and never replaces a later transformation.
            return call?.projectionOutcome !== undefined && call.parentResult !== undefined && isDeepStrictEqual(result, call.projectionOutcome)
                ? call.parentResult.content : undefined;
        },
    };
    const standingGuard = exec => exec.name !== "read" || exec.agent !== child ? undefined
        : removed || !calls.has(exec.token) || child.ctx.tools.get("read", child) !== definition
            || calls.get(exec.token).lease.signal.aborted ? "Legacy read requires an active child-local operation lease" : undefined;
    standingScope.ctx.tools.guard(standingGuard);
    // The standing listener outlives the proxy so native completion always retires acquired leases.
    const onResult = (exec, childResult) => {
        const call = calls.get(exec.token);
        if (call === undefined)
            return;
        calls.delete(exec.token);
        const outcomes = { childExecution: exec, childResult,
            ...(call.parentExecution === undefined ? {} : { parentExecution: call.parentExecution }),
            ...(call.parentResult === undefined ? {} : { parentResult: call.parentResult }) };
        const reportFault = (error) => {
            void composition.closeForChange("audit-fault");
            try {
                composition.owner.reportAuditFault(error, outcomes);
            }
            catch (reportError) {
                standingScope.ctx.logger.warn("Legacy read audit fault reporter failed", reportError);
            }
        };
        void (async () => {
            try {
                if (call.context !== undefined)
                    await call.context.finish(outcomes);
            }
            catch (error) {
                reportFault(error);
            }
            finally {
                try {
                    call.context?.release();
                }
                catch (error) {
                    reportFault(error);
                }
                finally {
                    call.lease.release();
                }
            }
        })();
    };
    standingScope.ctx.on("tools/result", onResult);
    const preExecute = async (exec, next) => {
        if (exec.agent !== child || exec.name !== "read")
            return next();
        let signal = exec.signal;
        const unavailable = (error) => signal.aborted ? { kind: "cancel" }
            : { kind: "deny", reason: "Legacy read operation unavailable", info: { name: "LegacyReadUnavailable",
                    code: error instanceof LegacyReadUnavailable ? error.code : "lifetime-unavailable" } };
        let call;
        try {
            const lease = composition.acquireLease(parent, child, evidence, exec.signal);
            call = { lease, invoked: false };
            calls.set(exec.token, call);
            signal = callSignal(exec, call);
            const context = await composition.owner.acquireCallContext(parent, child, exec, lease);
            if (!isLegacyReadCallLease(context))
                throw new LegacyReadUnavailable("audit-unavailable");
            call.context = context;
            signal = callSignal(exec, call);
            lease.assertActive();
            assertContext(call);
            signal.throwIfAborted();
        }
        catch (error) {
            return unavailable(error);
        }
        // Downstream exceptions remain native final-errors, and terminal decisions remain authoritative.
        const decision = await next();
        if (decision.kind === "deny" || decision.kind === "cancel")
            return decision;
        try {
            signal = callSignal(exec, call);
            call.lease.assertActive();
            assertContext(call);
            signal.throwIfAborted();
            // This pre-only adapter cannot prove the original child caller includes these lifetimes.
            // Parent approval instead receives a merged public execute input from the proxy body.
            if (decision.kind === "ask")
                throw new LegacyReadUnavailable("approval-unavailable");
        }
        catch (error) {
            return unavailable(error);
        }
        return decision;
    };
    proxyScope.ctx.on("tools/pre-execute", preExecute, { prepend: true });
    const complete = async (exec, next) => {
        const call = calls.get(exec.token);
        if (call === undefined)
            return next();
        const originalSignal = exec.signal;
        exec.signal = callSignal(exec, call);
        try {
            const downstream = await next();
            if (call.transport !== undefined && call.parentResult !== undefined && isDeepStrictEqual(downstream, call.transport)) {
                call.projectionOutcome = call.parentResult.isError ? call.parentResult : { ...call.transport,
                    ...(call.parentResult.additionalContexts === undefined ? {} : { additionalContexts: call.parentResult.additionalContexts }) };
                return call.parentResult;
            }
            return downstream;
        }
        finally {
            exec.signal = originalSignal;
        }
    };
    proxyScope.ctx.on("tools/execute", complete, { prepend: true });
    proxyScope.ctx.tools.register(definition);
    return { parent, child, definition, nativeDefinition, proxyScope, standingScope,
        contributions: Object.freeze([
            { stage: "pre", scope: proxyScope, reference: preExecute, order: 0 },
            { stage: "guard", scope: standingScope, reference: standingGuard, order: 0 },
            { stage: "around", scope: proxyScope, reference: complete, order: 0 },
            { stage: "project", scope: proxyScope, reference: definition.projectContent, order: 0 },
            { stage: "finalization", scope: standingScope, reference: onResult, order: 0 },
        ]),
        async removeProxy() {
            if (composition.view().state === "ready" || composition.view().activeCalls)
                throw new LegacyReadUnavailable("composition-unavailable");
            removed = true;
            await proxyScope.dispose();
        },
        async releaseAfterChildDispose() {
            if (child.ctx.get("agents")?.get(child.id) === child || composition.view().activeCalls)
                throw new LegacyReadUnavailable("lifetime-unavailable");
            removed = true;
            await proxyScope.dispose();
            await standingScope.dispose();
        }, };
}
//# sourceMappingURL=legacy-read-proxy.js.map