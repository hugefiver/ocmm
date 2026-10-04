import { applyEdits, modify } from "jsonc-parser";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { DsmmProfilesRemote } from "../profile-remote.js";
import { isProfileId } from "../profile-remote.js";
import type { ProfileErrorInfo, ProfileReadResult, ProfileSnapshot } from "../profile-types.js";

export interface ProfileEditor { id: string; content: string; revision: string | null }
export interface ProfilesNotice { key: "saved" | "applied" | "reset"; id?: string }
export interface ProfilesIssue { kind: "domain" | "transport" | "assembly"; code: string; message?: string; field?: string; source?: "selection" }
export interface ProfilesViewSnapshot {
  snapshot: ProfileSnapshot | null;
  editor: ProfileEditor | null;
  dirty: boolean;
  busy: "refresh" | "read" | "save" | "apply" | "reset" | null;
  issue: ProfilesIssue | null;
  notice: ProfilesNotice | null;
  pendingEditor: string | null;
}
export interface ProfilesActions {
  refresh(): Promise<void>;
  open(id: string): Promise<void>;
  create(): Promise<void>;
  reload(): Promise<void>;
  editId(id: string): void;
  editContent(content: string): void;
  save(): Promise<void>;
  apply(): Promise<void>;
  reset(): Promise<void>;
  discardAndOpen(): Promise<void>;
  cancelDiscard(): void;
}

const NEW_EDITOR = "";
export const NEW_PROFILE_CONTENT = '{\n  "version": 1,\n  "id": "new-profile",\n  "label": "New profile",\n  "settings": {\n    // Runtime overlay only. Omitted fields inherit the deployment baseline.\n    "defaultActive": true\n  }\n}\n';

/** A valid external CAS conflict is reconcilable; corruption is never reset implicitly. */
export function canReconcileSelection(snapshot: ProfileSnapshot | null): boolean {
  return snapshot !== null && (snapshot.selectionRevision === "absent" || /^[a-f0-9]{64}$/u.test(snapshot.selectionRevision))
    && (snapshot.selectionError === undefined || snapshot.selectionError.code === "conflict");
}

/** Stable native Store seat, with no filesystem or transport authority. */
export class ProfilesController {
  private current: ProfilesViewSnapshot = { snapshot: null, editor: null, dirty: false, busy: null, issue: null, notice: null, pendingEditor: null };
  private accepted: ProfileEditor | null = null;
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  readonly store = {
    getSnapshot: (): ProfilesViewSnapshot => this.current,
    subscribe: (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => { this.listeners.delete(listener); };
    },
  };
  readonly actions: ProfilesActions = {
    refresh: () => this.refresh(), open: (id) => this.open(id), create: () => this.open(NEW_EDITOR), reload: () => this.reload(),
    editId: (id) => this.editId(id), editContent: (content) => this.editContent(content),
    save: () => this.save(), apply: () => this.apply(), reset: () => this.reset(),
    discardAndOpen: () => this.discardAndOpen(), cancelDiscard: () => this.publish({ pendingEditor: null }),
  };
  constructor(private readonly remote: DsmmProfilesRemote) {}
  dispose(): void { this.disposed = true; this.generation += 1; this.listeners.clear(); }
  private publish(patch: Partial<ProfilesViewSnapshot>): void {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener();
  }
  private accept(document: ProfileEditor): void {
    this.accepted = { ...document };
    this.publish({ editor: { ...document }, dirty: false, pendingEditor: null });
  }
  private async unwrap<T>(request: Promise<RemoteResult<T>>, field?: string): Promise<T> {
    const result = await request;
    if (result.ok) return result.value;
    if (result.error.code === "dsmm-profiles/refused") {
      throw { kind: "domain", ...result.error.details } satisfies ProfilesIssue;
    }
    if (["gateway/input-invalid", "gateway/arguments-invalid"].includes(String(result.error.code))) {
      throw { kind: "domain", code: "validation", field, message: "The native Host rejected a request field. Check the profile ID and document size before retrying." } satisfies ProfilesIssue;
    }
    throw { kind: "transport", code: result.error.code } satisfies ProfilesIssue;
  }
  private issue(error: unknown): ProfilesIssue {
    if (typeof error === "object" && error !== null && "kind" in error && (error.kind === "domain" || error.kind === "transport")) return error as ProfilesIssue;
    return { kind: "assembly", code: "unavailable" };
  }
  private async perform(busy: NonNullable<ProfilesViewSnapshot["busy"]>, operation: (live: () => boolean) => Promise<void>): Promise<void> {
    if (this.disposed || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const generation = ++this.generation;
    const live = (): boolean => !this.disposed && generation === this.generation;
    this.publish({ busy, issue: null, notice: null });
    try { await operation(live); }
    catch (error) { if (live()) this.publish({ issue: this.issue(error) }); }
    finally { if (live()) this.publish({ busy: null }); }
  }
  async refresh(): Promise<void> {
    await this.perform("refresh", async (live) => {
      const snapshot = await this.unwrap(this.remote.describe());
      if (live()) this.publish({ snapshot });
    });
  }
  async open(id: string): Promise<void> {
    if (this.disposed || this.current.busy !== null || this.current.pendingEditor !== null) return;
    if (id !== NEW_EDITOR && this.current.editor?.id === id) return;
    if (this.current.dirty) { this.publish({ pendingEditor: id }); return; }
    await this.loadEditor(id);
  }
  async reload(): Promise<void> {
    const editor = this.current.editor;
    if (editor === null || editor.revision === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    if (this.current.dirty) { this.publish({ pendingEditor: editor.id }); return; }
    await this.loadEditor(editor.id);
  }
  private async loadEditor(id: string): Promise<void> {
    if (id === NEW_EDITOR) {
      this.accepted = null;
      this.publish({ editor: { id: "new-profile", content: NEW_PROFILE_CONTENT, revision: null }, dirty: true, issue: null, notice: null, pendingEditor: null });
      return;
    }
    await this.perform("read", async (live) => {
      const document = await this.unwrap(this.remote.read(id), "id");
      if (live()) this.accept(document);
    });
  }
  async discardAndOpen(): Promise<void> {
    const wanted = this.current.pendingEditor;
    if (wanted === null || this.current.busy !== null) return;
    this.publish({ pendingEditor: null });
    // Only explicit confirmation clears a draft; a failed read restores it.
    const previous = this.current.editor;
    const accepted = this.accepted;
    await this.loadEditor(wanted);
    if (this.current.issue !== null && previous !== null) {
      this.accepted = accepted;
      this.publish({ editor: previous, dirty: true });
    }
  }
  private editId(id: string): void {
    const editor = this.current.editor;
    if (editor === null || editor.revision !== null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    let content = editor.content;
    try { content = applyEdits(content, modify(content, ["id"], id, { formattingOptions: { insertSpaces: true, tabSize: 2 } })); }
    catch { /* Keep invalid JSONC intact; the Host explains validation on save. */ }
    this.publish({ editor: { ...editor, id, content }, dirty: true, issue: null, notice: null });
  }
  private editContent(content: string): void {
    const editor = this.current.editor;
    if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    this.publish({ editor: { ...editor, content }, dirty: this.accepted === null || this.accepted.content !== content || this.accepted.id !== editor.id, issue: null, notice: null });
  }
  async save(): Promise<void> {
    const editor = this.current.editor;
    if (editor === null || !this.current.dirty || this.current.snapshot === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    if (!isProfileId(editor.id)) {
      this.publish({ issue: { kind: "domain", code: "validation", field: "id" }, notice: null });
      return;
    }
    await this.perform("save", async (live) => {
      const document = await this.unwrap(this.remote.save({ id: editor.id, content: editor.content, expectedRevision: editor.revision }), "content");
      if (!live()) return;
      this.accept(document);
      // The accepted response proves save; applying remains a separate commit.
      const old = this.current.snapshot!;
      const profiles = old.profiles.filter((item) => item.id !== document.id);
      profiles.push({ id: document.id, revision: document.revision, ...(document.label === undefined ? {} : { label: document.label }) });
      profiles.sort((a, b) => a.id.localeCompare(b.id));
      this.publish({ snapshot: { ...old, profiles }, notice: { key: "saved", id: document.id } });
    });
  }
  async apply(): Promise<void> {
    const { editor, snapshot, dirty } = this.current;
    if (editor?.revision == null || !canReconcileSelection(snapshot) || dirty) return;
    await this.perform("apply", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: editor.id, expectedRevision: editor.revision!, expectedSelectionRevision: snapshot!.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "applied", id: accepted.selectedId ?? undefined });
    });
  }
  async reset(): Promise<void> {
    const snapshot = this.current.snapshot;
    if (!canReconcileSelection(snapshot)) return;
    await this.perform("reset", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: null, expectedSelectionRevision: snapshot!.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "reset" });
    });
  }
  private acceptSelection(snapshot: ProfileSnapshot, notice: ProfilesNotice): void {
    this.publish({ snapshot, notice: snapshot.selectionError === undefined ? notice : null,
      issue: snapshot.selectionError === undefined ? null : { kind: "domain", ...snapshot.selectionError, source: "selection" } });
  }
}

export type { ProfileErrorInfo, ProfileReadResult };
