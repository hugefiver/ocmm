import { Context, Service } from "@deepseek-ai/cordis";
import { SessionHandleClosedError, SessionPersistence, SessionReadOnlyError, materializeAppendBatch } from "@deepseek-ai/dsh-session-persistence";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { isDeepStrictEqual } from "node:util";
import { annotateDsmmEvent, DSMM_PERSISTENCE_COMPATIBILITY } from "./session-metadata.js";
export { DSMM_PERSISTENCE_COMPATIBILITY } from "./session-metadata.js";
/** Host-owned live routing; the native handle remains the sole storage/lock owner. */
class DsmmSessionHandle {
    native;
    cursor;
    warn;
    released;
    chain = Promise.resolve();
    closing;
    buffered = [];
    timer;
    paused = false;
    failure;
    routingFailure;
    constructor(native, cursor, warn, released) {
        this.native = native;
        this.cursor = cursor;
        this.warn = warn;
        this.released = released;
    }
    get id() { return this.native.id; }
    get header() { return this.native.header; }
    get access() { return this.native.access; }
    get inheritedEventCount() { return this.native.inheritedEventCount; }
    async read(offset, length, options) {
        this.assertOpen("read");
        return this.native.read(offset, length, options);
    }
    async append(events, options) {
        this.assertOpen("append");
        options?.signal?.throwIfAborted();
        const batch = materializeAppendBatch(events).map(annotateDsmmEvent);
        await this.enqueue(async () => {
            options?.signal?.throwIfAborted();
            if (this.access !== "write")
                throw new SessionReadOnlyError(this.id, "append");
            if (this.paused)
                throw this.failure;
            // Live records preceding this explicit batch must commit first. Later live
            // records cannot overtake a direct append waiting on the mutation chain.
            await this.drain(batch[0]?.seq ?? Number.POSITIVE_INFINITY, options?.signal);
            await this.native.append(batch, options);
            this.cursor += batch.length;
            this.scheduleDrain();
        });
    }
    async flush(options) {
        this.assertOpen("flush");
        await this.enqueue(async () => {
            options?.signal?.throwIfAborted();
            if (this.access !== "write")
                throw new SessionReadOnlyError(this.id, "flush");
            this.paused = false;
            await this.drain(Number.POSITIVE_INFINITY, options?.signal);
            await this.native.flush(options);
        });
    }
    enqueueLive(event) {
        if (this.closing !== undefined)
            return;
        let owned;
        try {
            owned = annotateDsmmEvent(materializeAppendBatch([event])[0]);
        }
        catch (error) {
            this.routingFailure ??= error;
            this.cancelTimer();
            this.warn(this.id, error);
            return;
        }
        this.buffered.push(owned);
        this.scheduleDrain();
    }
    scheduleDrain() {
        if (this.buffered.length === 0 || this.timer !== undefined || this.paused
            || this.routingFailure !== undefined || this.closing !== undefined)
            return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            const last = this.buffered.at(-1);
            if (last === undefined)
                return;
            // Fence this queued operation to the prefix accepted now. Events published
            // after a later direct append is queued belong behind that append.
            const beforeSeq = last.seq + 1;
            void this.enqueue(async () => {
                if (!this.paused) {
                    await this.drain(beforeSeq);
                    this.scheduleDrain();
                }
            }).catch((error) => this.warn(this.id, error));
        }, 200);
    }
    close() {
        return this.closing ??= this.enqueue(async () => {
            this.cancelTimer();
            const errors = [];
            try {
                this.paused = false;
                await this.drain();
                if (this.access === "write")
                    await this.native.flush();
            }
            catch (error) {
                errors.push(error);
            }
            try {
                await this.native.close();
            }
            catch (error) {
                errors.push(error);
            }
            const failure = errors.length > 1 ? new AggregateError(errors, `session "${this.id}": close failed`)
                : errors[0];
            this.released(this, failure);
            if (errors.length > 0)
                throw failure;
        });
    }
    [Symbol.asyncDispose]() { return this.close(); }
    enqueue(operation) {
        const next = this.chain.then(operation);
        // The caller observes rejection; this recovery only keeps later barriers usable.
        this.chain = next.then(() => undefined, () => undefined);
        return next;
    }
    async drain(beforeSeq = Number.POSITIVE_INFINITY, signal) {
        this.cancelTimer();
        if (this.routingFailure !== undefined)
            throw this.routingFailure;
        while (this.buffered.length > 0 && this.buffered[0].seq < beforeSeq) {
            signal?.throwIfAborted();
            const count = this.buffered.findIndex((event) => event.seq >= beforeSeq);
            const batch = this.buffered.slice(0, count < 0 ? undefined : count);
            try {
                // An explicitly appended event may subsequently be published by the live
                // store. Coalesce only byte-equivalent logical events, never conflicts.
                let duplicateCount = 0;
                while (duplicateCount < batch.length && batch[duplicateCount].seq < this.cursor)
                    duplicateCount++;
                if (duplicateCount > 0) {
                    const existing = await this.native.read(batch[0].seq, duplicateCount, { signal });
                    if (!isDeepStrictEqual(existing.events, batch.slice(0, duplicateCount))) {
                        throw new Error(`session "${this.id}": live event conflicts with the persisted prefix`);
                    }
                }
                const fresh = batch.slice(duplicateCount);
                await this.native.append(fresh, { signal });
                this.cursor += fresh.length;
                this.buffered.splice(0, batch.length);
                this.failure = undefined;
            }
            catch (error) {
                this.cancelTimer();
                this.paused = true;
                this.failure = error;
                throw error;
            }
        }
    }
    cancelTimer() {
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
    }
    assertOpen(operation) {
        if (this.closing !== undefined)
            throw new SessionHandleClosedError(this.id, operation);
    }
}
/**
 * Drop-in native JSONL persistence companion for audited DSMM metadata.
 * A separate root Context is intentional: a child service-isolation scope still
 * shares the host event bus and would persist every live event twice.
 */
export default class DsmmSessionPersistence extends SessionPersistence {
    config;
    static Config = JsonlSessionPersistence.Config;
    name = "dsmm-session-persistence";
    inner = new Context();
    ready;
    handles = new Set();
    writers = new Map();
    acquisitions = new Set();
    closeFailures = new Map();
    disposed = false;
    constructor(ctx, config) {
        super(ctx);
        this.config = config;
        Object.defineProperty(this, DSMM_PERSISTENCE_COMPATIBILITY, {
            value: true, writable: false, configurable: false, enumerable: false
        });
        const nativeFiber = this.inner.plugin(JsonlSessionPersistence, config);
        this.ready = nativeFiber.await().then(() => this.inner.sessionPersistence);
        ctx.on("session/event", (session, event) => this.writers.get(session.id)?.enqueueLive(event));
        ctx.on("session/flush", (session) => this.writers.get(session.id)?.flush());
        ctx.on("session/disposed", (session) => {
            const writer = this.writers.get(session.id);
            if (writer !== undefined)
                void writer.close().catch((error) => this.warn(session.id, error));
        });
        // One outer disposer enforces the ownership boundary: drain/close every
        // adapter handle before disposing the still-live native storage Context.
        ctx.effect(() => async () => {
            this.disposed = true;
            await Promise.allSettled([...this.acquisitions]);
            const errors = [...this.closeFailures.values()];
            for (const handle of [...this.handles]) {
                try {
                    await handle.close();
                }
                catch (error) {
                    errors.push(error);
                }
            }
            try {
                await this.inner.fiber.dispose();
            }
            catch (error) {
                errors.push(error);
            }
            if (errors.length > 0)
                throw new AggregateError(errors, `${this.name} dispose failed`);
        }, "dsmm-session-persistence ordered shutdown");
    }
    async [Service.init]() { await this.ready; }
    create(header, options) {
        return this.acquire(async (native) => native.create(header, options), false);
    }
    open(id, access, options) {
        return this.acquire(async (native) => native.open(id, access, options), access === "write");
    }
    async flush() {
        this.assertActive();
        const errors = [];
        for (const handle of [...this.writers.values()]) {
            try {
                await handle.flush();
            }
            catch (error) {
                if (!(error instanceof SessionHandleClosedError))
                    errors.push(error);
            }
        }
        if (errors.length > 0)
            throw new AggregateError(errors, `${this.name} flush failed`);
    }
    async stat(id, options) {
        this.assertActive();
        return (await this.ready).stat(id, options);
    }
    async list(options) {
        this.assertActive();
        return (await this.ready).list(options);
    }
    acquire(factory, existing) {
        this.assertActive();
        const operation = (async () => {
            const native = await factory(await this.ready);
            let cursor = 0;
            try {
                if (existing)
                    cursor = (await native.read()).events.length;
            }
            catch (error) {
                try {
                    await native.close();
                }
                catch (closeError) {
                    throw new AggregateError([error, closeError], `session "${native.id}": open failed`);
                }
                throw error;
            }
            const handle = new DsmmSessionHandle(native, cursor, (id, error) => this.warn(id, error), (closed, error) => {
                this.handles.delete(closed);
                if (this.writers.get(closed.id) === closed)
                    this.writers.delete(closed.id);
                if (error !== undefined)
                    this.closeFailures.set(closed.id, error);
            });
            this.handles.add(handle);
            if (handle.access === "write")
                this.writers.set(handle.id, handle);
            return handle;
        })();
        this.acquisitions.add(operation);
        void operation.then(() => this.acquisitions.delete(operation), () => this.acquisitions.delete(operation));
        return operation;
    }
    warn(id, error) {
        const errorClass = error instanceof Error && /^[A-Za-z][A-Za-z0-9]*Error$/u.test(error.name) ? error.name : "Error";
        this.ctx.logger.warn("Deepwork session persistence failed", { sessionId: id, errorClass });
    }
    assertActive() {
        if (this.disposed)
            throw new Error("Deepwork session persistence is disposed");
    }
}
//# sourceMappingURL=session-persistence.js.map