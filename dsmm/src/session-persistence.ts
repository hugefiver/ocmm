import { Context, Service } from "@deepseek-ai/cordis";
import type { SessionEvent, SessionHeader, SessionId } from "@deepseek-ai/dsh-session";
import {
  SessionHandleClosedError, SessionPersistence, SessionReadOnlyError, materializeAppendBatch
} from "@deepseek-ai/dsh-session-persistence";
import type {
  SessionAccess, SessionHandle, SessionHandleAppendOptions, SessionHandleFlushOptions,
  SessionHandleReadOptions, SessionPersistenceCreateOptions, SessionPersistenceListOptions,
  SessionPersistenceOpenOptions, SessionPersistenceStatOptions
} from "@deepseek-ai/dsh-session-persistence";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import type { Config } from "@deepseek-ai/dsh-session-persistence-jsonl";
import { isDeepStrictEqual } from "node:util";
import { annotateDsmmEvent, DSMM_PERSISTENCE_COMPATIBILITY } from "./session-metadata.js";

export { DSMM_PERSISTENCE_COMPATIBILITY } from "./session-metadata.js";
export type { Config } from "@deepseek-ai/dsh-session-persistence-jsonl";

/** Host-owned live routing; the native handle remains the sole storage/lock owner. */
class DsmmSessionHandle implements SessionHandle {
  private chain: Promise<void> = Promise.resolve();
  private closing?: Promise<void>;
  private buffered: SessionEvent[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private paused = false;
  private failure?: unknown;
  private routingFailure?: unknown;

  constructor(
    private readonly native: SessionHandle,
    private cursor: number,
    private readonly warn: (id: SessionId, error: unknown) => void,
    private readonly released: (handle: DsmmSessionHandle, error?: unknown) => void
  ) {}

  get id() { return this.native.id; }
  get header() { return this.native.header; }
  get access() { return this.native.access; }
  get inheritedEventCount() { return this.native.inheritedEventCount; }

  async read(offset?: number, length?: number, options?: SessionHandleReadOptions) {
    this.assertOpen("read");
    return this.native.read(offset, length, options);
  }

  async append(events: readonly SessionEvent[], options?: SessionHandleAppendOptions): Promise<void> {
    this.assertOpen("append");
    options?.signal?.throwIfAborted();
    const batch = materializeAppendBatch(events).map(annotateDsmmEvent);
    await this.enqueue(async () => {
      options?.signal?.throwIfAborted();
      if (this.access !== "write") throw new SessionReadOnlyError(this.id, "append");
      if (this.paused) throw this.failure;
      // Live records preceding this explicit batch must commit first. Later live
      // records cannot overtake a direct append waiting on the mutation chain.
      await this.drain(batch[0]?.seq ?? Number.POSITIVE_INFINITY, options?.signal);
      await this.native.append(batch, options);
      this.cursor += batch.length;
      this.scheduleDrain();
    });
  }

  async flush(options?: SessionHandleFlushOptions): Promise<void> {
    this.assertOpen("flush");
    await this.enqueue(async () => {
      options?.signal?.throwIfAborted();
      if (this.access !== "write") throw new SessionReadOnlyError(this.id, "flush");
      this.paused = false;
      await this.drain(Number.POSITIVE_INFINITY, options?.signal);
      await this.native.flush(options);
    });
  }

  enqueueLive(event: SessionEvent): void {
    if (this.closing !== undefined) return;
    let owned: SessionEvent;
    try { owned = annotateDsmmEvent(materializeAppendBatch([event])[0]!); }
    catch (error) {
      this.routingFailure ??= error;
      this.cancelTimer();
      this.warn(this.id, error);
      return;
    }
    this.buffered.push(owned);
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.buffered.length === 0 || this.timer !== undefined || this.paused
      || this.routingFailure !== undefined || this.closing !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const last = this.buffered.at(-1);
      if (last === undefined) return;
      // Fence this queued operation to the prefix accepted now. Events published
      // after a later direct append is queued belong behind that append.
      const beforeSeq = last.seq + 1;
      void this.enqueue(async () => {
        if (!this.paused) {
          await this.drain(beforeSeq);
          this.scheduleDrain();
        }
      }).catch((error: unknown) => this.warn(this.id, error));
    }, 200);
  }

  close(): Promise<void> {
    return this.closing ??= this.enqueue(async () => {
      this.cancelTimer();
      const errors: unknown[] = [];
      try {
        this.paused = false;
        await this.drain();
        if (this.access === "write") await this.native.flush();
      } catch (error) { errors.push(error); }
      try { await this.native.close(); } catch (error) { errors.push(error); }
      const failure = errors.length > 1 ? new AggregateError(errors, `session "${this.id}": close failed`)
        : errors[0];
      this.released(this, failure);
      if (errors.length > 0) throw failure;
    });
  }

  [Symbol.asyncDispose](): Promise<void> { return this.close(); }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.chain.then(operation);
    // The caller observes rejection; this recovery only keeps later barriers usable.
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  }

  private async drain(beforeSeq = Number.POSITIVE_INFINITY, signal?: AbortSignal): Promise<void> {
    this.cancelTimer();
    if (this.routingFailure !== undefined) throw this.routingFailure;
    while (this.buffered.length > 0 && this.buffered[0]!.seq < beforeSeq) {
      signal?.throwIfAborted();
      const count = this.buffered.findIndex((event) => event.seq >= beforeSeq);
      const batch = this.buffered.slice(0, count < 0 ? undefined : count);
      try {
        // An explicitly appended event may subsequently be published by the live
        // store. Coalesce only byte-equivalent logical events, never conflicts.
        let duplicateCount = 0;
        while (duplicateCount < batch.length && batch[duplicateCount]!.seq < this.cursor) duplicateCount++;
        if (duplicateCount > 0) {
          const existing = await this.native.read(batch[0]!.seq, duplicateCount, { signal });
          if (!isDeepStrictEqual(existing.events, batch.slice(0, duplicateCount))) {
            throw new Error(`session "${this.id}": live event conflicts with the persisted prefix`);
          }
        }
        const fresh = batch.slice(duplicateCount);
        await this.native.append(fresh, { signal });
        this.cursor += fresh.length;
        this.buffered.splice(0, batch.length);
        this.failure = undefined;
      } catch (error) {
        this.cancelTimer();
        this.paused = true;
        this.failure = error;
        throw error;
      }
    }
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private assertOpen(operation: string): void {
    if (this.closing !== undefined) throw new SessionHandleClosedError(this.id, operation);
  }
}

/**
 * Drop-in native JSONL persistence companion for audited DSMM metadata.
 * A separate root Context is intentional: a child service-isolation scope still
 * shares the host event bus and would persist every live event twice.
 */
export default class DsmmSessionPersistence extends SessionPersistence {
  static Config = JsonlSessionPersistence.Config;
  override readonly name = "dsmm-session-persistence";
  private readonly inner = new Context();
  private readonly ready: Promise<SessionPersistence>;
  private readonly handles = new Set<DsmmSessionHandle>();
  private readonly writers = new Map<SessionId, DsmmSessionHandle>();
  private readonly acquisitions = new Set<Promise<SessionHandle>>();
  private readonly closeFailures = new Map<SessionId, unknown>();
  private disposed = false;

  constructor(ctx: Context, readonly config: Config) {
    super(ctx);
    Object.defineProperty(this, DSMM_PERSISTENCE_COMPATIBILITY, {
      value: true, writable: false, configurable: false, enumerable: false
    });
    const nativeFiber = this.inner.plugin(JsonlSessionPersistence, config);
    this.ready = nativeFiber.await().then(() => this.inner.sessionPersistence);
    ctx.on("session/event", (session, event) => this.writers.get(session.id)?.enqueueLive(event));
    ctx.on("session/flush", (session) => this.writers.get(session.id)?.flush());
    ctx.on("session/disposed", (session) => {
      const writer = this.writers.get(session.id);
      if (writer !== undefined) void writer.close().catch((error: unknown) => this.warn(session.id, error));
    });
    // One outer disposer enforces the ownership boundary: drain/close every
    // adapter handle before disposing the still-live native storage Context.
    ctx.effect(() => async () => {
      this.disposed = true;
      await Promise.allSettled([...this.acquisitions]);
      const errors: unknown[] = [...this.closeFailures.values()];
      for (const handle of [...this.handles]) {
        try { await handle.close(); } catch (error) { errors.push(error); }
      }
      try { await this.inner.fiber.dispose(); } catch (error) { errors.push(error); }
      if (errors.length > 0) throw new AggregateError(errors, `${this.name} dispose failed`);
    }, "dsmm-session-persistence ordered shutdown");
  }

  async [Service.init](): Promise<void> { await this.ready; }

  create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle> {
    return this.acquire(async (native) => native.create(header, options), false);
  }

  open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle> {
    return this.acquire(async (native) => native.open(id, access, options), access === "write");
  }

  async flush(): Promise<void> {
    this.assertActive();
    const errors: unknown[] = [];
    for (const handle of [...this.writers.values()]) {
      try { await handle.flush(); } catch (error) {
        if (!(error instanceof SessionHandleClosedError)) errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, `${this.name} flush failed`);
  }

  async stat(id: SessionId, options?: SessionPersistenceStatOptions) {
    this.assertActive();
    return (await this.ready).stat(id, options);
  }

  async list(options?: SessionPersistenceListOptions) {
    this.assertActive();
    return (await this.ready).list(options);
  }

  private acquire(factory: (native: SessionPersistence) => Promise<SessionHandle>, existing: boolean): Promise<SessionHandle> {
    this.assertActive();
    const operation = (async () => {
      const native = await factory(await this.ready);
      let cursor = 0;
      try {
        if (existing) cursor = (await native.read()).events.length;
      } catch (error) {
        try { await native.close(); } catch (closeError) {
          throw new AggregateError([error, closeError], `session "${native.id}": open failed`);
        }
        throw error;
      }
      const handle = new DsmmSessionHandle(native, cursor,
        (id, error) => this.warn(id, error),
        (closed, error) => {
          this.handles.delete(closed);
          if (this.writers.get(closed.id) === closed) this.writers.delete(closed.id);
          if (error !== undefined) this.closeFailures.set(closed.id, error);
        });
      this.handles.add(handle);
      if (handle.access === "write") this.writers.set(handle.id, handle);
      return handle;
    })();
    this.acquisitions.add(operation);
    void operation.then(() => this.acquisitions.delete(operation), () => this.acquisitions.delete(operation));
    return operation;
  }

  private warn(id: SessionId, error: unknown): void {
    const errorClass = error instanceof Error && /^[A-Za-z][A-Za-z0-9]*Error$/u.test(error.name) ? error.name : "Error";
    this.ctx.logger.warn("DSMM session persistence failed", { sessionId: id, errorClass });
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("DSMM session persistence is disposed");
  }
}
