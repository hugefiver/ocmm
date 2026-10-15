import type { PermissionControlSettings } from "../permission-settings.js";
import type { PermissionRuleDraft, PermissionRulesSaveRequest, PermissionRulesSaveResult } from "../permission-rules.js";
import { PermissionClientError } from "./permission-client.js";
import type { PermissionInvoker, PermissionIssue } from "./permission-client.js";

export interface PermissionDraft {
  outsideReads: PermissionControlSettings["outsideReads"];
  webSearch: PermissionControlSettings["webSearch"];
  webFetch: PermissionControlSettings["webFetch"];
  upsert: readonly PermissionRuleDraft[];
  revoke: readonly string[];
  editor: PermissionRuleDraft | null;
}
export interface PermissionView {
  generation: number;
  sessionId: string | null;
  scope: "unknown" | "root" | "child";
  connected: boolean;
  reading: boolean;
  busy: "save" | null;
  rules: PermissionRulesSaveResult | null;
  base: PermissionRulesSaveResult["snapshot"] | null;
  draft: PermissionDraft | null;
  rulesIssue: PermissionIssue | null;
  dirty: boolean;
  notice: "saved" | null;
}
const draftOf = (policy: PermissionControlSettings): PermissionDraft => ({ outsideReads: policy.outsideReads, webSearch: { ...policy.webSearch }, webFetch: { ...policy.webFetch }, upsert: [], revoke: [], editor: null });
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export function permissionChanges(view: PermissionView): PermissionRulesSaveRequest | null {
  const { base, draft } = view;
  if (base === null || draft === null) return null;
  const changes = Object.fromEntries((["outsideReads", "webSearch", "webFetch"] as const).filter(key => !same(base.policy[key], draft[key])).map(key => [key, draft[key]]));
  if (Object.keys(changes).length === 0 && draft.upsert.length === 0 && draft.revoke.length === 0) return null;
  return { expectedRevision: base.revision, ...(Object.keys(changes).length ? { changes } : {}), ...(draft.upsert.length ? { upsert: draft.upsert } : {}), ...(draft.revoke.length ? { revoke: draft.revoke } : {}) };
}
const empty = (): PermissionView => ({ generation: 0, sessionId: null, scope: "unknown", connected: false, reading: false, busy: null,
  rules: null, base: null, draft: null, rulesIssue: null, dirty: false, notice: null });

/** Borrowed native selection plus last-observed C state; never a Root or policy authority. */
export class PermissionController {
  private state = empty();
  private listeners = new Set<() => void>();
  private invoke: PermissionInvoker | null = null;
  private connection: unknown;
  private owner: object | null = null;
  private request = new AbortController();
  private requestSequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private watchers = 0;
  private disposed = false;
  readonly store = { getSnapshot: (): PermissionView => this.state, subscribe: (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; } };
  private publish(patch: Partial<PermissionView>): void { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  private cancel(): void { this.request.abort(); this.request = new AbortController(); this.requestSequence++; clearTimeout(this.timer); }
  private fence(preserve: boolean): void {
    this.cancel();
    this.publish({ generation: this.state.generation + 1, reading: false, busy: null, notice: null,
      rules: null, rulesIssue: null, ...preserve ? {} : { base: null, draft: null, dirty: false } });
  }
  bindConnection(invoke: PermissionInvoker | null, generation?: unknown): void {
    if (this.disposed || this.invoke === invoke && this.connection === generation) return;
    this.invoke = invoke; this.connection = generation; this.fence(true); this.publish({ connected: invoke !== null }); this.schedule(true);
  }
  bindScope(sessionId: string | null, owner: object | null, scope: PermissionView["scope"]): void {
    if (this.disposed || this.state.sessionId === sessionId && this.owner === owner && this.state.scope === scope) return;
    const preserve = sessionId === this.state.sessionId;
    this.owner = owner; this.fence(preserve); this.publish({ sessionId, scope }); this.schedule(true);
  }
  watch(): () => void {
    this.watchers++; if (this.watchers === 1) this.schedule(true);
    let active = true;
    return () => { if (!active) return; active = false; this.watchers--; if (this.watchers === 0) this.fence(true); };
  }
  dispose(): void { if (this.disposed) return; this.fence(false); this.disposed = true; this.listeners.clear(); this.invoke = null; this.owner = null; }
  private live(generation: number): boolean { return !this.disposed && generation === this.state.generation && this.owner !== null && this.invoke !== null && this.state.scope === "root" && this.state.sessionId !== null; }
  private schedule(immediate = false): void {
    clearTimeout(this.timer);
    if (this.watchers === 0 || !this.live(this.state.generation)) return;
    this.timer = setTimeout(() => { void this.refresh(this.state.generation); }, immediate ? 0 : 1000);
    this.timer.unref?.();
  }
  private issue(error: unknown): PermissionIssue { return error instanceof PermissionClientError ? error.code : "transport"; }
  private synchronized(): boolean {
    const value = this.state.rules;
    return value !== null && value.runtime.state === "synced" && value.runtime.savedRevision === value.snapshot.revision && value.runtime.runtimeRevision === value.snapshot.revision;
  }
  canSave(generation: number): boolean { return this.live(generation) && this.state.rulesIssue === null && this.synchronized() && !this.state.reading && this.state.busy === null && this.state.dirty && this.state.draft?.editor === null; }
  async refresh(generation: number, discard = false): Promise<void> {
    if (!this.live(generation) || this.state.reading || this.state.busy !== null) return;
    const sequence = ++this.requestSequence, signal = this.request.signal, id = this.state.sessionId!;
    this.publish({ reading: true });
    const [rules] = await Promise.allSettled([this.invoke!("describeRules", [id], signal)]);
    if (!this.live(generation) || signal.aborted || sequence !== this.requestSequence) return;
    if (rules.status === "rejected") {
      this.publish({ rules: null, rulesIssue: this.issue(rules.reason), reading: false });
    } else {
      const value = rules.value;
      const retain = this.state.dirty && !discard;
      this.publish({ rules: value, rulesIssue: retain && this.state.base?.revision !== value.snapshot.revision ? "stale" : null,
        reading: false,
        ...retain ? {} : { base: value.snapshot, draft: draftOf(value.snapshot.policy), dirty: false } });
    }
    this.schedule();
  }
  edit(generation: number, patch: Partial<PermissionDraft>): void {
    if (this.disposed || generation !== this.state.generation || this.state.draft === null || this.state.busy !== null) return;
    const draft = { ...this.state.draft, ...patch };
    this.publish({ draft, notice: null }); this.publish({ dirty: draft.editor !== null || permissionChanges(this.state) !== null });
  }
  stageRule(generation: number): void {
    const draft = this.state.draft, editor = draft?.editor;
    if (editor == null || !editor.id || editor.id.length > 256 || editor.id.includes("\0")) return;
    const match = editor.match;
    if (match.kind === "outside-read" && !match.path || match.kind === "shell" && (!match.executable || !match.command || !match.workingDirectory)) return;
    this.edit(generation, { upsert: [...draft!.upsert.filter(row => row.id !== editor.id), structuredClone(editor)], revoke: draft!.revoke.filter(id => id !== editor.id), editor: null });
  }
  stageRevoke(generation: number, id: string): void {
    const draft = this.state.draft;
    if (draft === null || !this.state.base?.policy.rules.some(rule => rule.id === id)) return;
    this.edit(generation, { upsert: draft.upsert.filter(row => row.id !== id), revoke: [...new Set([...draft.revoke, id])], editor: draft.editor?.id === id ? null : draft.editor });
  }
  private begin(busy: NonNullable<PermissionView["busy"]>): { signal: AbortSignal; id: string } {
    this.cancel();
    this.publish({ busy, notice: null });
    return { signal: this.request.signal, id: this.state.sessionId! };
  }
  async save(generation: number): Promise<void> {
    const request = permissionChanges(this.state);
    if (!this.canSave(generation) || request === null) return;
    const current = this.begin("save");
    try {
      const result = await this.invoke!("saveRules", [current.id, request], current.signal);
      if (this.live(generation)) this.publish({ rules: result, base: result.snapshot, draft: draftOf(result.snapshot.policy), dirty: false, rulesIssue: null, notice: "saved" });
    } catch (error) { if (this.live(generation)) this.publish({ rules: null, rulesIssue: this.issue(error) }); }
    finally { if (this.live(generation)) { this.publish({ busy: null }); this.schedule(); } }
  }
}
