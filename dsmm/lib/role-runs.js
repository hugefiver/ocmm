import { settleRun, SubagentError } from "@deepseek-ai/dsh-subagent";
import { scopeLifetime } from "./delivery-authority.js";
// Cancellation provenance belongs to each holder, not to a rejection's error code.
const cancelledDrains = new WeakSet();
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    // Holders remain observable even when a caller stops waiting after handoff.
    void promise.catch(() => { });
    return { promise, resolve, reject };
}
function terminalError(result) {
    if (result.stopReason === "completed")
        return undefined;
    const partial = result.output.filter((block) => block.type === "text").map((block) => block.text).join("");
    return new SubagentError(`subagent ${result.stopReason}${result.diagnostic === undefined ? "" : `: ${result.diagnostic}`}${partial === "" ? "" : `\nPartial output: ${partial}`}`, result.stopReason.toUpperCase());
}
/** One foreground call's real native run and its revocable caller-cancel relay. */
export class RoleRunHolder {
    controller = new AbortController();
    readyResult = deferred();
    foregroundResult = deferred();
    drainedResult = deferred();
    currentState = "starting";
    identity;
    receipt;
    outcome;
    terminal = false;
    finished = false;
    registering = false;
    committing = false;
    detachParent = () => { };
    callerRelay;
    ready = this.readyResult.promise;
    foreground = this.foregroundResult.promise;
    /** Quiescence, preserving typed result and aggregate cleanup errors even in background. */
    drained = this.drainedResult.promise;
    request;
    collaborators;
    release;
    constructor(request, collaborators, release) {
        this.request = request;
        this.collaborators = collaborators;
        this.release = release;
        this.callerRelay = () => {
            // Native registration cannot fail after its synchronous starter returns.
            // Contained registered-event reentrancy must not let the old caller kill
            // work whose ownership has just committed to the native job.
            if (!this.committing)
                this.cancel(request.callerAbort.reason);
        };
        this.detachParent = scopeLifetime(request.parent.ctx, "dsmm.roleRun: exact parent lifetime", () => {
            if (this.finished)
                return;
            collaborators.teardown.revokeParent(request.parent, "parent-disposed");
            this.cancel(new SubagentError("DSMM run parent was disposed", "ABORTED"));
        });
        request.callerAbort.addEventListener("abort", this.callerRelay, { once: true });
        if (request.callerAbort.aborted)
            this.callerRelay();
        void Promise.resolve().then(() => this.begin());
    }
    get state() { return this.currentState; }
    get owner() { return this.request.owner; }
    get sessionId() { return this.request.sessionId; }
    get toolCallId() { return this.request.toolCallId; }
    get invocation() { return this.identity; }
    get holderSignal() { return this.controller.signal; }
    cancel(reason) {
        if (this.finished)
            return;
        if (!this.terminal)
            this.currentState = "cancelled";
        this.controller.abort(reason);
    }
    background(request) {
        this.assertAddress(request);
        this.assertAuthorization(request);
        if (this.receipt !== undefined)
            return { status: "already-background", receipt: this.receipt };
        if (this.currentState === "cancelled")
            return { status: "cancelled" };
        if (this.terminal)
            return { status: "already-settled" };
        if (this.identity === undefined)
            return { status: "starting" };
        const jobs = this.request.jobs;
        if (jobs === undefined)
            throw new SubagentError("DSMM background requires native jobs and an owner controller", "UNSUPPORTED_CAPABILITY");
        if (this.registering)
            throw new SubagentError("DSMM background registration is already in progress", "UNAUTHORIZED");
        this.registering = true;
        try {
            const jobId = jobs.start({ kind: "subagent", owner: this.request.parent.id, label: this.request.label, run: () => {
                    // This is the final, synchronous native-registration critical section.
                    this.assertAuthorization(request);
                    if (this.terminal || this.controller.signal.aborted)
                        throw new SubagentError("DSMM run is no longer transferable", "ABORTED");
                    this.committing = true;
                    return { cancel: (reason) => this.cancel(reason), done: this.outcome };
                } });
            this.receipt = Object.freeze({ kind: "background", jobId, invocation: this.identity });
            this.request.callerAbort.removeEventListener("abort", this.callerRelay);
            if (!this.controller.signal.aborted && !this.terminal)
                this.currentState = "background";
            this.foregroundResult.resolve(this.receipt);
            return { status: "background", receipt: this.receipt };
        }
        finally {
            this.committing = false;
            this.registering = false;
            // Preflight/authorization failure leaves cancellation and disposal owned
            // by this foreground holder, including a caller abort during preflight.
            if (this.receipt === undefined && this.request.callerAbort.aborted)
                this.callerRelay();
        }
    }
    assertAddress(address) {
        if (address.parent !== this.request.parent || address.owner !== this.request.owner
            || address.sessionId !== this.request.sessionId || address.toolCallId !== this.request.toolCallId
            || (this.identity !== undefined && address.runId !== this.identity.runId)) {
            throw new SubagentError("DSMM run requires exact parent, owner and invocation", "UNAUTHORIZED");
        }
    }
    assertAuthorization(request) {
        const epoch = this.collaborators.currentEpoch(request.parent, request.owner);
        if (epoch !== request.expectedAdmissionEpoch)
            throw new SubagentError("DSMM run admission epoch changed", "UNAUTHORIZED");
        if (this.identity !== undefined && !this.collaborators.canBackground(request.parent, this.identity, epoch)) {
            throw new SubagentError("DSMM background capability is disabled", "UNSUPPORTED_CAPABILITY");
        }
        if (this.collaborators.currentEpoch(request.parent, request.owner) !== epoch) {
            throw new SubagentError("DSMM run admission changed during authorization", "UNAUTHORIZED");
        }
    }
    async begin() {
        try {
            if (this.controller.signal.aborted) {
                // No native starter has been invoked, so this is holder-owned cancellation.
                cancelledDrains.add(this.drained);
                this.controller.signal.throwIfAborted();
            }
            if (this.collaborators.currentEpoch(this.request.parent, this.request.owner) !== this.request.admissionEpoch) {
                throw new SubagentError("DSMM run admission changed before start", "UNAUTHORIZED");
            }
            const run = await this.request.start(this.controller.signal);
            this.identity = Object.freeze({ parent: this.request.parent, owner: this.request.owner,
                sessionId: this.request.sessionId, toolCallId: this.request.toolCallId, runId: run.id,
                admissionEpoch: this.request.admissionEpoch, capture: this.request.capture, projection: this.request.projection,
                mode: "one-shot", ...(run.localAgent === undefined ? {} : { childId: run.localAgent.id }) });
            if (!this.controller.signal.aborted)
                this.currentState = "running";
            let execution;
            let disposal;
            // Only this read/observer consumes the original native result. Settlement
            // borrows its cached promise and a single disposer, not a replacement run.
            const result = run.result.then((value) => {
                execution = { status: "fulfilled", value };
                this.observed(value.stopReason === "aborted");
                return value;
            }, (reason) => {
                execution = { status: "rejected", reason };
                this.observed(this.controller.signal.aborted);
                throw reason;
            });
            let disposed;
            const dispose = () => disposed ??= Promise.resolve().then(() => {
                if (run.localAgent !== undefined)
                    this.collaborators.teardown.revokeParent(run.localAgent, "run-disposed");
                return this.collaborators.teardown.disposeRun(run);
            }).then(() => { disposal = { status: "fulfilled", value: undefined }; }, (reason) => {
                disposal = { status: "rejected", reason };
                throw reason;
            });
            this.outcome = settleRun({ id: run.id, localAgent: run.localAgent, result, dispose });
            this.readyResult.resolve(this.identity);
            await this.outcome;
            const failure = execution.status === "rejected" ? execution.reason : terminalError(execution.value);
            const failed = execution.status === "rejected" || failure !== undefined;
            if (execution.status === "fulfilled" && execution.value.stopReason === "aborted" && disposal.status === "fulfilled") {
                cancelledDrains.add(this.drained);
            }
            if (failed && disposal.status === "rejected")
                throw new AggregateError([failure, disposal.reason], "DSMM subagent result and disposal failed");
            if (execution.status === "rejected")
                throw execution.reason;
            if (failure !== undefined)
                throw failure;
            if (disposal.status === "rejected")
                throw disposal.reason;
            this.foregroundResult.resolve({ kind: "foreground", runId: run.id, invocation: this.identity, output: execution.value.output });
            this.drainedResult.resolve();
        }
        catch (error) {
            this.observed(this.controller.signal.aborted);
            this.readyResult.reject(error);
            this.foregroundResult.reject(error);
            this.drainedResult.reject(error);
        }
        finally {
            this.finished = true;
            this.request.callerAbort.removeEventListener("abort", this.callerRelay);
            this.detachParent();
            this.release();
        }
    }
    observed(cancelled) {
        if (this.terminal)
            return;
        this.terminal = true;
        this.currentState = cancelled || this.controller.signal.aborted ? "cancelled" : "settled";
    }
}
/** Current process-local calls only; native jobs remain the sole background registry. */
export class RoleRunRegistry {
    calls = new Map();
    closed = false;
    collaborators;
    /** ctx is the stable Host-owned scope, not a reinstalled profile entry. */
    constructor(ctx, collaborators) {
        this.collaborators = collaborators;
        scopeLifetime(ctx, "dsmm.roleRuns: close Host admission", () => this.close("host-disposed"));
        ctx.effect(() => () => this.drain(), "dsmm.roleRuns: drain native holders");
    }
    start(request) {
        if (this.closed || request.sessionId !== request.parent.id)
            throw new SubagentError("DSMM run requires a live exact session owner", "UNAUTHORIZED");
        if (this.collaborators.currentEpoch(request.parent, request.owner) !== request.admissionEpoch) {
            throw new SubagentError("DSMM run requires current admission", "UNAUTHORIZED");
        }
        let calls = this.calls.get(request.parent);
        if (calls === undefined) {
            calls = new Map();
            this.calls.set(request.parent, calls);
        }
        if (calls.has(request.toolCallId))
            throw new SubagentError("DSMM invocation is already held", "UNAUTHORIZED");
        const entries = calls;
        try {
            const holder = new RoleRunHolder(request, this.collaborators, () => {
                entries.delete(request.toolCallId);
                if (entries.size === 0)
                    this.calls.delete(request.parent);
            });
            entries.set(request.toolCallId, holder);
            return holder;
        }
        catch (error) {
            if (entries.size === 0)
                this.calls.delete(request.parent);
            throw error;
        }
    }
    /** Host-only lookup; C3 must authorize operator/session/epoch before exposing a view. */
    get(parent, owner, address) {
        this.collaborators.currentEpoch(parent, owner);
        const holder = this.calls.get(parent)?.get(address.toolCallId);
        const identity = holder?.invocation;
        return identity?.owner === owner && identity.sessionId === address.sessionId && identity.runId === address.runId ? holder : undefined;
    }
    /** Host-only active-call inventory, including starting calls without invented run ids. */
    list(parent, owner) {
        this.collaborators.currentEpoch(parent, owner);
        return [...this.calls.get(parent)?.values() ?? []].filter((holder) => holder.owner === owner);
    }
    /**
     * Trusted parent teardown first revokes C1 authority, then awaits this before
     * the original AgentHandle.dispose. Already-revoked tickets are not reacquired.
     */
    async drainParent(parent, owner, reason) {
        const holders = [...this.calls.get(parent)?.values() ?? []];
        // Trusted teardown may have already revoked the C1 ticket. Match the exact
        // held parent/entry owner, rather than reacquiring revoked admission.
        if (holders.some((holder) => holder.owner !== owner))
            throw new SubagentError("DSMM run drain requires exact owner", "UNAUTHORIZED");
        if (holders.length === 0)
            return;
        this.collaborators.teardown.revokeParent(parent, reason);
        for (const holder of holders)
            holder.cancel(new SubagentError("DSMM run owner was disposed", "ABORTED"));
        await this.awaitHolders(holders);
    }
    close(reason) {
        this.closed = true;
        for (const [parent, calls] of this.calls) {
            this.collaborators.teardown.revokeParent(parent, reason);
            for (const holder of calls.values())
                holder.cancel(new SubagentError("DSMM run Host was disposed", "ABORTED"));
        }
    }
    async drain() {
        await this.awaitHolders([...this.calls.values()].flatMap((calls) => [...calls.values()]));
    }
    async awaitHolders(holders) {
        const results = await Promise.allSettled(holders.map((holder) => holder.drained));
        // Native cancellation is successful teardown; infrastructure/cleanup faults
        // remain errors and are never relabeled as ordinary cancellation.
        const errors = results.flatMap((result, index) => result.status === "rejected"
            && !cancelledDrains.has(holders[index].drained) ? [result.reason] : []);
        if (errors.length > 0)
            throw new AggregateError(errors, "DSMM native run drain failed");
    }
}
//# sourceMappingURL=role-runs.js.map