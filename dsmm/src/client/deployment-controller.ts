import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { ConfigFormSnapshot, ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { ConnectionGenerationState } from "@deepseek-ai/dsh-client-connection/client";
import type { DsmmConfigRemote } from "../profile-remote.js";
import type { DeploymentEditorSnapshot, SessionProfileSnapshot } from "../profile-types.js";
import { equal, editLayer, layerDiff, mergeLayer, record, validateEditorValue } from "./deployment-data.js";

export type DeploymentIssue = "unavailable" | "not-owned" | "conflict" | "validation" | "transport";
export interface DeploymentView {
  snapshot: DeploymentEditorSnapshot | null;
  draft: Record<string, unknown>;
  dirty: boolean;
  busy: boolean;
  issue: DeploymentIssue | null;
  saved: boolean;
  session: SessionProfileSnapshot | null;
}
export interface NativePageForm {
  state: ConfigFormSnapshot<Record<string, unknown>>;
  mutate: ConfigForm<Record<string, unknown>>["mutate"];
}
class Refusal extends Error { constructor(readonly code: DeploymentIssue) { super(code); } }
async function unwrap<T>(promise: Promise<RemoteResult<T>>): Promise<T> {
  const result = await promise;
  if (result.ok) return result.value;
  if (result.error.code === "dsmm-profiles/refused") {
    const code = result.error.details.code;
    throw new Refusal(["conflict", "validation", "not-owned"].includes(code) ? code as DeploymentIssue : "unavailable");
  }
  throw new Refusal("transport");
}

/** Drafts and CAS baselines, never a second configuration authority. */
export class DeploymentController {
  private state: DeploymentView = { snapshot: null, draft: {}, dirty: false, busy: false, issue: null, saved: false, session: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private baseline: Record<string, unknown> = {};
  private form: NativePageForm | null = null;
  private invalid = new Set<string>();
  private connection: ConnectionGenerationState | null = null;
  private connectionBaseline: unknown;
  private stopConnection: (() => void) | null = null;
  constructor(private readonly remote: DsmmConfigRemote, readonly layer: "global" | "profile", readonly rowNamespace: string | null = null) {}
  readonly getSnapshot = (): DeploymentView => this.state;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  dispose(): void { this.disposed = true; this.generation++; this.stopConnection?.(); this.listeners.clear(); this.form = null; }
  bindConnection(source: ConnectionGenerationState): void {
    this.stopConnection?.(); this.connection = source;
    this.stopConnection = source.subscribe(() => {
      if (this.disposed) return;
      this.generation++;
      this.publish({ busy: false, issue: source.getSnapshot() === undefined ? "transport" : "conflict", saved: false });
    });
  }
  forProfile(namespace: string): DeploymentController {
    const controller = new DeploymentController(this.remote, "profile", namespace);
    if (this.connection !== null) controller.bindConnection(this.connection);
    return controller;
  }
  private currentConnection(): boolean { return this.connection === null || this.connection.getSnapshot() !== undefined && this.connection.getSnapshot() === this.connectionBaseline; }
  setSession(session: SessionProfileSnapshot | null): void { this.publish({ session }); }
  private publish(patch: Partial<DeploymentView>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener();
  }
  attachForm(form: NativePageForm | null): void { this.form = form; }
  setInvalid(path: string, invalid: boolean): void {
    if (this.invalid.has(path) === invalid) return;
    if (invalid) this.invalid.add(path); else this.invalid.delete(path);
    this.publish({ dirty: this.invalid.size > 0 || !equal(this.baseline, this.state.draft), saved: false });
  }
  canWriteProfile(snapshot = this.state.snapshot): boolean {
    const native = this.form?.state;
    return this.currentConnection() && snapshot !== null && this.rowNamespace !== null && this.rowNamespace === snapshot.namespace
      && native?.status === "ready" && native.mode === "host" && native.writable
      && native.revision === snapshot.nativeFormRevision && snapshot.nativeForm !== null
      && equal(native.base ?? null, snapshot.nativeForm.base) && equal(native.user ?? null, snapshot.nativeForm.user);
  }
  edit(path: readonly string[], value: unknown): void {
    if (this.state.busy || this.disposed || this.state.snapshot === null || !this.currentConnection() || this.state.issue === "not-owned" || this.layer === "profile" && !this.canWriteProfile()) return;
    const draft = editLayer(this.state.draft, path, value);
    this.publish({ draft, dirty: this.invalid.size > 0 || !equal(this.baseline, draft), issue: null, saved: false });
  }
  async refresh(discard = false): Promise<void> {
    if (this.disposed || this.state.busy) return;
    const generation = ++this.generation;
    const connection = this.connection?.getSnapshot();
    this.publish({ busy: true, saved: false });
    try {
      if (this.connection !== null && connection === undefined) throw new Refusal("transport");
      const snapshot = await unwrap(this.remote.describeSettings());
      if (this.disposed || generation !== this.generation) return;
      const old = this.state.snapshot;
      if (old !== null && (old.entryId !== snapshot.entryId || old.hostProfileKey !== snapshot.hostProfileKey)) throw new Refusal("unavailable");
      if (this.state.dirty && !discard) {
        const stale = !this.currentConnection() || (this.layer === "global" ? old?.globalRevision !== snapshot.globalRevision : old?.nativeRevision !== snapshot.nativeRevision || old?.globalRevision !== snapshot.globalRevision);
        this.publish({ issue: stale ? "conflict" : null });
      } else {
        this.invalid.clear();
        this.connectionBaseline = connection;
        this.baseline = this.layer === "global" ? snapshot.global : record(snapshot.nativeForm?.user) ? snapshot.nativeForm.user : {};
        this.publish({ snapshot, draft: structuredClone(this.baseline), dirty: false, issue: null });
      }
    } catch (error) { if (!this.disposed && generation === this.generation) this.publish({ issue: error instanceof Refusal ? error.code : "transport" }); }
    finally { if (!this.disposed && generation === this.generation) this.publish({ busy: false }); }
  }
  async save(): Promise<void> {
    const { snapshot, draft, dirty, busy, issue } = this.state;
    if (this.disposed || snapshot === null || !dirty || busy || issue !== null || !this.currentConnection() || this.invalid.size > 0 || this.layer === "profile" && !this.canWriteProfile()) return;
    const schema = this.layer === "global" ? snapshot.schema : { ...snapshot.schema, fields: Object.fromEntries(Object.entries(snapshot.schema.fields ?? {}).filter(([key]) => key !== "modules")) };
    const editable = { ...draft };
    if (this.layer === "profile") {
      if (!equal(editable.sessionPersistence, this.baseline.sessionPersistence)) { this.publish({ issue: "validation" }); return; }
      delete editable.sessionPersistence;
    }
    const lower = this.layer === "global" ? snapshot.defaults : mergeLayer(mergeLayer(snapshot.defaults, snapshot.global), snapshot.nativeForm?.base ?? {});
    const merged = mergeLayer(lower, editable) as Record<string, unknown>;
    delete merged.sessionPersistence;
    if (!validateEditorValue(editable, schema, true) || !validateEditorValue(merged, snapshot.schema)) { this.publish({ issue: "validation" }); return; }
    const edits = layerDiff(this.baseline, draft);
    if (edits.length > 128) { this.publish({ issue: "validation" }); return; }
    const generation = ++this.generation;
    this.publish({ busy: true, saved: false });
    try {
      const current = await unwrap(this.remote.describeSettings());
      if (this.disposed || generation !== this.generation) return;
      if (current.entryId !== snapshot.entryId || current.hostProfileKey !== snapshot.hostProfileKey || current.globalRevision !== snapshot.globalRevision) throw new Refusal("conflict");
      if (this.layer === "global") await unwrap(this.remote.save({ expectedRevision: snapshot.globalRevision, edits }));
      else {
        if (current.nativeRevision !== snapshot.nativeRevision || !this.canWriteProfile(current)) throw new Refusal("conflict");
        const form = this.form!;
        if (!await form.mutate(edits, snapshot.nativeFormRevision!)) throw new Refusal("conflict");
      }
      if (this.disposed || generation !== this.generation) return;
      this.baseline = structuredClone(draft);
      this.publish({ dirty: false, saved: true, issue: null });
      // A successful durable save remains successful even if the follow-up read fails.
      try { const next = await unwrap(this.remote.describeSettings()); if (!this.disposed && generation === this.generation) this.publish({ snapshot: next }); }
      catch { if (!this.disposed && generation === this.generation) this.publish({ issue: "unavailable" }); }
    } catch (error) { if (!this.disposed && generation === this.generation) this.publish({ issue: error instanceof Refusal ? error.code : "transport" }); }
    finally { if (!this.disposed && generation === this.generation) this.publish({ busy: false }); }
  }
}
