import { isProfileId } from "../profile-remote.js";
import { editStructuredPath, moveFallback } from "./structured.js";
function modelSelectionWatermark(window) {
    let watermark = -1;
    for (const entry of window.entries)
        if (entry.type === "event" && entry.event.type === "model/selection")
            watermark = Math.max(watermark, Number(entry.event.seq));
    return watermark;
}
function modeIntentWatermark(window) {
    let watermark = -1;
    for (const entry of window.entries)
        if (entry.type === "event" && (entry.event.type === "deepwork/mode" || entry.event.type === "agent-preset/selected"))
            watermark = Math.max(watermark, Number(entry.event.seq));
    return watermark;
}
const NEW_EDITOR = "";
export const NEW_PROFILE_CONTENT = '{\n  "version": 1,\n  "id": "new-profile",\n  "label": "New profile",\n  "settings": {\n    // Runtime overlay only. Omitted fields inherit the deployment baseline.\n    "defaultActive": true\n  }\n}\n';
/** A valid external CAS conflict is reconcilable; corruption is never reset implicitly. */
export function canReconcileSelection(snapshot) {
    return snapshot !== null && (snapshot.selectionRevision === "absent" || /^[a-f0-9]{64}$/u.test(snapshot.selectionRevision))
        && (snapshot.selectionError === undefined || snapshot.selectionError.code === "conflict");
}
/** Stable native Store seat, with no filesystem or transport authority. */
export class ProfilesController {
    remote;
    current = { snapshot: null, editor: null, dirty: false, busy: null, issue: null, notice: null, pendingEditor: null,
        catalog: null, catalogBusy: false, catalogUnavailable: true, currentSessionId: null, session: null, sessionChoice: null, sessionBusy: null, sessionIssue: null, sessionNotice: null, invalidFields: [], editorEpoch: 0 };
    accepted = null;
    listeners = new Set();
    generation = 0;
    disposed = false;
    sessionGeneration = 0;
    catalogGeneration = 0;
    catalogRemote = null;
    modelSelectorGeneration = 0;
    modelSelector = null;
    modelSelectionSource = null;
    modelSelectionSessionId = null;
    modelSelectionGeneration = 0;
    stopModelSelection = null;
    modelEvents = null;
    modelEventsSessionId = null;
    modelEventsGeneration = 0;
    modelEventsWatermark = -1;
    modeEventsWatermark = -1;
    modeRefreshPending = false;
    stopModelEvents = null;
    modelInteraction = null;
    modelInteractionSessionId = null;
    modelInteractionGeneration = 0;
    stopModelInteraction = null;
    store = {
        getSnapshot: () => this.current,
        subscribe: (listener) => {
            this.listeners.add(listener);
            return () => { this.listeners.delete(listener); };
        },
    };
    actions = {
        refresh: () => this.refresh(), open: (id) => this.open(id), create: () => this.open(NEW_EDITOR), reload: () => this.reload(),
        editId: (id) => this.editId(id), editContent: (content) => this.editContent(content),
        save: () => this.save(), apply: () => this.apply(), reset: () => this.reset(),
        discardAndOpen: () => this.discardAndOpen(), cancelDiscard: () => this.publish({ pendingEditor: null }),
        editPath: (path, value) => this.editPath(path, value), moveFallback: (role, from, to) => this.editFallbackOrder(role, from, to),
        editRoute: (path, provider, model) => this.editRoute(path, provider, model),
        refreshCatalog: () => this.refreshCatalog(), refreshSession: () => this.refreshSession(),
        chooseSessionProfile: (id) => { if (!this.disposed && this.current.sessionBusy === null && this.current.busy === null && !this.current.dirty)
            this.publish({ sessionChoice: id, sessionNotice: null }); },
        applySession: (options) => this.selectSession(false, options), resetSession: () => this.selectSession(true),
        setDeepwork: (active) => this.setDeepwork(active), useSessionProfileModel: () => this.selectSession(false, { useProfileModel: true }, true),
        setFieldInvalid: (field, invalid) => {
            if (this.disposed)
                return;
            const invalidFields = this.current.invalidFields.filter((candidate) => candidate !== field);
            if (invalid)
                invalidFields.push(field);
            if (invalidFields.join("\n") !== this.current.invalidFields.join("\n"))
                this.publish({ invalidFields, ...(invalid ? { dirty: true } : {}) });
        },
    };
    constructor(remote) {
        this.remote = remote;
    }
    dispose() { this.disposed = true; this.generation += 1; this.sessionGeneration += 1; this.catalogGeneration += 1; this.modelSelectorGeneration += 1; this.modelSelectionGeneration += 1; this.stopModelSelection?.(); this.stopModelEvents?.(); this.stopModelInteraction?.(); this.stopModelSelection = null; this.stopModelEvents = null; this.stopModelInteraction = null; this.modelSelectionSource = null; this.modelEvents = null; this.modelInteraction = null; this.catalogRemote = null; this.modelSelector = null; this.listeners.clear(); }
    attachModelSelector(remote) {
        if (this.disposed)
            return;
        this.modelSelectorGeneration += 1;
        this.modelSelector = remote;
    }
    attachModelSelectionSource(sessionId, source) {
        if (this.disposed || (sessionId === this.modelSelectionSessionId && source === this.modelSelectionSource))
            return;
        this.modelSelectionGeneration += 1;
        this.stopModelSelection?.();
        this.modelSelectionSessionId = sessionId;
        this.modelSelectionSource = source;
        this.stopModelSelection = source?.subscribe(() => { this.modelSelectionGeneration += 1; }) ?? null;
    }
    attachModelEventSource(sessionId, source) {
        if (this.disposed || (sessionId === this.modelEventsSessionId && source === this.modelEvents))
            return;
        this.modelEventsGeneration += 1;
        this.stopModelEvents?.();
        this.modelEventsSessionId = sessionId;
        this.modelEvents = source;
        this.modelEventsWatermark = source === null ? -1 : modelSelectionWatermark(source.getSnapshot());
        this.modeEventsWatermark = source === null ? -1 : modeIntentWatermark(source.getSnapshot());
        this.stopModelEvents = source?.subscribe(() => {
            const window = source.getSnapshot(), change = window.change;
            if (change.kind === "settle-assistant")
                return;
            let watermark = change.kind === "replace" ? -1 : this.modelEventsWatermark;
            for (const entry of change.entries)
                if (entry.type === "event" && entry.event.type === "model/selection")
                    watermark = Math.max(watermark, Number(entry.event.seq));
            if (watermark !== this.modelEventsWatermark) {
                this.modelEventsWatermark = watermark;
                this.modelEventsGeneration += 1;
            }
            let modeWatermark = change.kind === "replace" ? -1 : this.modeEventsWatermark;
            for (const entry of change.entries)
                if (entry.type === "event" && (entry.event.type === "deepwork/mode" || entry.event.type === "agent-preset/selected"))
                    modeWatermark = Math.max(modeWatermark, Number(entry.event.seq));
            if (modeWatermark !== this.modeEventsWatermark) {
                this.modeEventsWatermark = modeWatermark;
                if (sessionId === this.current.currentSessionId) {
                    this.modeRefreshPending = true;
                    this.refreshObservedMode();
                }
            }
        }) ?? null;
    }
    attachModelInteractionSource(sessionId, source) {
        if (this.disposed || (sessionId === this.modelInteractionSessionId && source === this.modelInteraction))
            return;
        this.modelInteractionGeneration += 1;
        this.stopModelInteraction?.();
        this.modelInteractionSessionId = sessionId;
        this.modelInteraction = source;
        this.stopModelInteraction = source?.subscribe(() => { if (source.getSnapshot().status === "selecting")
            this.modelInteractionGeneration += 1; }) ?? null;
    }
    attachCatalog(remote) {
        if (this.disposed)
            return;
        this.catalogGeneration += 1;
        this.catalogRemote = remote;
        this.publish({ catalogBusy: false, catalogUnavailable: remote === null });
        if (remote !== null)
            void this.refreshCatalog();
    }
    setSession(id) {
        if (this.disposed || id === this.current.currentSessionId)
            return;
        this.sessionGeneration += 1;
        this.modeRefreshPending = false;
        if (id !== this.modelSelectionSessionId)
            this.attachModelSelectionSource(null, null);
        if (id !== this.modelEventsSessionId)
            this.attachModelEventSource(null, null);
        if (id !== this.modelInteractionSessionId)
            this.attachModelInteractionSource(null, null);
        this.publish({ currentSessionId: id, session: null, sessionChoice: null, sessionBusy: null, sessionIssue: null, sessionNotice: null });
        if (id !== null)
            void this.refreshSession();
    }
    async refreshCatalog() {
        if (this.disposed || this.current.catalogBusy || this.catalogRemote === null)
            return;
        const remote = this.catalogRemote, generation = ++this.catalogGeneration;
        this.publish({ catalogBusy: true });
        try {
            const catalog = await this.unwrap(remote.modelCatalog());
            if (!this.disposed && generation === this.catalogGeneration)
                this.publish({ catalog, catalogUnavailable: false });
        }
        catch {
            if (!this.disposed && generation === this.catalogGeneration)
                this.publish({ catalogUnavailable: true });
        }
        finally {
            if (!this.disposed && generation === this.catalogGeneration)
                this.publish({ catalogBusy: false });
        }
    }
    refreshObservedMode() {
        if (!this.disposed && this.modeRefreshPending && this.current.sessionBusy === null)
            void this.refreshSession(true);
    }
    async refreshSession(preserveFeedback = false) {
        const id = this.current.currentSessionId;
        if (this.disposed || id === null || this.current.sessionBusy !== null)
            return;
        this.modeRefreshPending = false;
        const generation = ++this.sessionGeneration;
        const live = () => !this.disposed && generation === this.sessionGeneration && id === this.current.currentSessionId;
        this.publish({ sessionBusy: "read", ...(preserveFeedback ? {} : { sessionIssue: null, sessionNotice: null }) });
        try {
            const session = await this.unwrap(this.remote.describeSession(id));
            if (session.sessionId !== id)
                throw { kind: "assembly", code: "unavailable" };
            if (live())
                this.publish({ session, sessionChoice: session.selection.selectedId });
        }
        catch (error) {
            if (live())
                this.publish({ sessionIssue: this.issue(error) });
        }
        finally {
            if (live()) {
                this.publish({ sessionBusy: null });
                this.refreshObservedMode();
            }
        }
    }
    async setDeepwork(active) {
        const { currentSessionId: id, session } = this.current;
        if (this.disposed || id === null || session?.deepwork === undefined || session.deepwork.locked || !session.switchAllowed
            || this.current.sessionBusy !== null || this.current.busy !== null || this.remote.selectMode === undefined)
            return;
        const generation = ++this.sessionGeneration;
        const live = () => !this.disposed && generation === this.sessionGeneration && id === this.current.currentSessionId;
        this.publish({ sessionBusy: "mode", sessionIssue: null, sessionNotice: null });
        try {
            const accepted = await this.unwrap(this.remote.selectMode(id, { sessionId: id, active,
                expectedModeRevision: session.deepwork.revision, expectedAdmissionEpoch: session.admissionEpoch }));
            if (accepted.sessionId !== id || accepted.deepwork?.active !== active || !accepted.deepwork.explicit)
                throw { kind: "assembly", code: "unavailable" };
            if (live())
                this.publish({ session: accepted, sessionNotice: active ? "mode-on" : "mode-off" });
        }
        catch (error) {
            if (live())
                this.publish({ sessionIssue: this.issue(error) });
        }
        finally {
            if (live()) {
                this.publish({ sessionBusy: null });
                this.refreshObservedMode();
            }
        }
    }
    async selectSession(reset, options, modelOnly = false) {
        const { currentSessionId: id, session, sessionChoice, snapshot } = this.current;
        if (this.disposed || id === null || session === null || !session.switchAllowed || this.current.sessionBusy !== null
            || this.current.busy !== null || this.current.dirty || this.current.pendingEditor !== null)
            return;
        const selectedId = reset ? null : sessionChoice;
        const revision = snapshot?.profiles.find((profile) => profile.id === selectedId)?.revision;
        if (!modelOnly && selectedId !== null && revision == null)
            return;
        const generation = ++this.sessionGeneration;
        const useProfileModel = !reset && options?.useProfileModel === true;
        const selector = this.modelSelector, selectorGeneration = this.modelSelectorGeneration;
        const modelSource = this.modelSelectionSource, modelGeneration = this.modelSelectionGeneration;
        const modelSnapshot = modelSource?.getSnapshot();
        const eventSource = this.modelEvents, eventGeneration = this.modelEventsGeneration;
        const eventWatermark = eventSource === null ? -1 : modelSelectionWatermark(eventSource.getSnapshot());
        const modeWatermark = eventSource === null ? -1 : modeIntentWatermark(eventSource.getSnapshot());
        const interaction = this.modelInteraction, interactionGeneration = this.modelInteractionGeneration;
        const pendingNativeChoice = interaction?.getSnapshot().status === "selecting";
        const live = () => !this.disposed && generation === this.sessionGeneration && id === this.current.currentSessionId;
        const selectorLive = () => live() && selector !== null && selector === this.modelSelector && selectorGeneration === this.modelSelectorGeneration;
        this.publish({ sessionBusy: reset ? "reset" : "apply", sessionIssue: null, sessionNotice: null });
        try {
            const accepted = await this.unwrap(modelOnly ? this.remote.describeSession(id) : this.remote.selectSession(id, {
                sessionId: id, id: selectedId, ...(selectedId === null ? {} : { expectedRevision: revision }),
                expectedSelectionRevision: session.selection.selectionRevision, expectedAdmissionEpoch: session.admissionEpoch,
            }));
            if (accepted.sessionId !== id)
                throw { kind: "assembly", code: "unavailable" };
            if (modelOnly && (accepted.admissionEpoch !== session.admissionEpoch || accepted.deepwork?.revision !== session.deepwork?.revision || !accepted.switchAllowed))
                throw { kind: "domain", code: "conflict" };
            if (!live())
                return;
            this.publish({ session: accepted, sessionChoice: accepted.selection.selectedId, sessionNotice: useProfileModel ? null : reset ? "reset" : "applied" });
            if (!useProfileModel || !live())
                return;
            if (accepted.profileModel === undefined) {
                this.publish({ sessionIssue: { kind: "assembly", code: "model-unconfigured", source: "profile-model" } });
                return;
            }
            if (!selectorLive()) {
                this.publish({ sessionIssue: { kind: "assembly", code: "model-service-unavailable", source: "profile-model" } });
                return;
            }
            if (modelSource === null || modelSnapshot === undefined || this.modelSelectionSessionId !== id || modelSource !== this.modelSelectionSource || modelSource.getSnapshot() === undefined) {
                this.publish({ sessionIssue: { kind: "assembly", code: "model-observation-unavailable", source: "profile-model" } });
                return;
            }
            // Projection fences cover observed view changes, including a frame whose
            // notification has not fired. The raw sequence fence below covers deduped intent.
            if (modelGeneration !== this.modelSelectionGeneration || !Object.is(modelSnapshot, modelSource.getSnapshot())) {
                this.publish({ sessionIssue: { kind: "assembly", code: "model-choice-changed", source: "profile-model" } });
                return;
            }
            if (eventSource === null || eventSource !== this.modelEvents || this.modelEventsSessionId !== id
                || interaction === null || interaction !== this.modelInteraction || this.modelInteractionSessionId !== id) {
                this.publish({ sessionIssue: { kind: "assembly", code: "model-observation-unavailable", source: "profile-model" } });
                return;
            }
            if (eventGeneration !== this.modelEventsGeneration || eventWatermark !== modelSelectionWatermark(eventSource.getSnapshot())
                || (modelOnly && modeWatermark !== modeIntentWatermark(eventSource.getSnapshot()))
                || interactionGeneration !== this.modelInteractionGeneration || pendingNativeChoice || interaction.getSnapshot().status === "selecting") {
                this.publish({ sessionIssue: { kind: "assembly", code: "model-choice-changed", source: "profile-model" } });
                return;
            }
            try {
                // The accepted DTO and current native view have the same validated ID;
                // native strict codecs remain authoritative for its branded wire type.
                await this.unwrap(selector.selectModel({ sessionId: id, ...accepted.profileModel }));
                // Never echo the returned model locally: native projections own the
                // actual picker, and a later native Models-tab selection must win.
                if (live())
                    this.publish(selectorLive() && modelSource === this.modelSelectionSource && this.modelSelectionSessionId === id ? { sessionNotice: "applied-with-model" }
                        : { sessionIssue: { kind: "assembly", code: "model-service-unavailable", source: "profile-model" } });
            }
            catch {
                if (live())
                    this.publish({ sessionIssue: { kind: "assembly", code: selectorLive() ? "model-selection-failed" : "model-service-unavailable", source: "profile-model" } });
            }
        }
        catch (error) {
            if (live())
                this.publish({ sessionIssue: this.issue(error) });
        }
        finally {
            if (live()) {
                this.publish({ sessionBusy: null });
                this.refreshObservedMode();
            }
        }
    }
    publish(patch) {
        if (this.disposed)
            return;
        this.current = { ...this.current, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    accept(document) {
        this.accepted = { ...document };
        this.publish({ editor: { ...document }, dirty: false, pendingEditor: null, invalidFields: [], editorEpoch: this.current.editorEpoch + 1 });
    }
    async unwrap(request, field) {
        const result = await request;
        if (result.ok)
            return result.value;
        if (result.error.code === "dsmm-profiles/refused") {
            throw { kind: "domain", ...result.error.details };
        }
        if (["gateway/input-invalid", "gateway/arguments-invalid"].includes(String(result.error.code))) {
            throw { kind: "domain", code: "validation", field, message: "The native Host rejected a request field. Check the profile ID and document size before retrying." };
        }
        throw { kind: "transport", code: result.error.code };
    }
    issue(error) {
        if (typeof error === "object" && error !== null && "kind" in error && (error.kind === "domain" || error.kind === "transport"))
            return error;
        return { kind: "assembly", code: "unavailable" };
    }
    async perform(busy, operation) {
        if (this.disposed || this.current.busy !== null || this.current.sessionBusy === "apply" || this.current.sessionBusy === "reset" || this.current.pendingEditor !== null)
            return;
        const generation = ++this.generation;
        const live = () => !this.disposed && generation === this.generation;
        this.publish({ busy, issue: null, notice: null });
        try {
            await operation(live);
        }
        catch (error) {
            if (live())
                this.publish({ issue: this.issue(error) });
        }
        finally {
            if (live())
                this.publish({ busy: null });
        }
    }
    async refresh() {
        await this.perform("refresh", async (live) => {
            const snapshot = await this.unwrap(this.remote.describe());
            if (live())
                this.publish({ snapshot });
        });
    }
    async open(id) {
        if (this.disposed || this.current.busy !== null || this.current.pendingEditor !== null)
            return;
        if (id !== NEW_EDITOR && this.current.editor?.id === id)
            return;
        if (this.current.dirty) {
            this.publish({ pendingEditor: id });
            return;
        }
        await this.loadEditor(id);
    }
    async reload() {
        const editor = this.current.editor;
        if (editor === null || editor.revision === null || this.current.busy !== null || this.current.pendingEditor !== null)
            return;
        if (this.current.dirty) {
            this.publish({ pendingEditor: editor.id });
            return;
        }
        await this.loadEditor(editor.id);
    }
    async loadEditor(id) {
        if (id === NEW_EDITOR) {
            this.accepted = null;
            this.publish({ editor: { id: "new-profile", content: NEW_PROFILE_CONTENT, revision: null }, dirty: true, issue: null, notice: null, pendingEditor: null, invalidFields: [], editorEpoch: this.current.editorEpoch + 1 });
            return;
        }
        await this.perform("read", async (live) => {
            const document = await this.unwrap(this.remote.read(id), "id");
            if (live())
                this.accept(document);
        });
    }
    async discardAndOpen() {
        const wanted = this.current.pendingEditor;
        if (wanted === null || this.current.busy !== null)
            return;
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
    editId(id) {
        const editor = this.current.editor;
        if (editor === null || editor.revision !== null || this.current.busy !== null || this.current.pendingEditor !== null)
            return;
        const content = editStructuredPath(editor.content, ["id"], id);
        if (content === null) {
            this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
            return;
        }
        this.publish({ editor: { ...editor, id, content }, dirty: true, issue: null, notice: null });
    }
    editContent(content) {
        const editor = this.current.editor;
        if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null)
            return;
        this.publish({ editor: { ...editor, content }, dirty: this.accepted === null || this.accepted.content !== content || this.accepted.id !== editor.id, issue: null, notice: null });
    }
    editPath(path, value) {
        const editor = this.current.editor;
        if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null)
            return;
        const content = editStructuredPath(editor.content, path, value);
        if (content === null) {
            this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
            return;
        }
        this.editContent(content);
    }
    editRoute(path, provider, model) {
        const editor = this.current.editor;
        if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null)
            return;
        let content = editor.content;
        for (const [key, value] of [["provider", provider], ["model", model], ["reasoningEffort", undefined]]) {
            content = editStructuredPath(content, [...path, key], value);
            if (content === null) {
                this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
                return;
            }
        }
        this.editContent(content);
    }
    editFallbackOrder(role, from, to) {
        const editor = this.current.editor;
        if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null)
            return;
        const content = moveFallback(editor.content, role, from, to);
        if (content !== null)
            this.editContent(content);
    }
    async save() {
        const editor = this.current.editor;
        if (editor === null || !this.current.dirty || this.current.snapshot === null || this.current.busy !== null || this.current.pendingEditor !== null || this.current.invalidFields.length > 0)
            return;
        if (!isProfileId(editor.id)) {
            this.publish({ issue: { kind: "domain", code: "validation", field: "id" }, notice: null });
            return;
        }
        await this.perform("save", async (live) => {
            const document = await this.unwrap(this.remote.save({ id: editor.id, content: editor.content, expectedRevision: editor.revision }), "content");
            if (!live())
                return;
            this.accept(document);
            // The accepted response proves save; applying remains a separate commit.
            const old = this.current.snapshot;
            const profiles = old.profiles.filter((item) => item.id !== document.id);
            profiles.push({ id: document.id, revision: document.revision, ...(document.label === undefined ? {} : { label: document.label }) });
            profiles.sort((a, b) => a.id.localeCompare(b.id));
            this.publish({ snapshot: { ...old, profiles }, notice: { key: "saved", id: document.id } });
        });
    }
    async apply() {
        const { editor, snapshot, dirty } = this.current;
        if (editor?.revision == null || !canReconcileSelection(snapshot) || dirty)
            return;
        await this.perform("apply", async (live) => {
            const accepted = await this.unwrap(this.remote.select({ id: editor.id, expectedRevision: editor.revision, expectedSelectionRevision: snapshot.selectionRevision }));
            if (live())
                this.acceptSelection(accepted, { key: "applied", id: accepted.selectedId ?? undefined });
        });
    }
    async reset() {
        const snapshot = this.current.snapshot;
        if (!canReconcileSelection(snapshot))
            return;
        await this.perform("reset", async (live) => {
            const accepted = await this.unwrap(this.remote.select({ id: null, expectedSelectionRevision: snapshot.selectionRevision }));
            if (live())
                this.acceptSelection(accepted, { key: "reset" });
        });
    }
    acceptSelection(snapshot, notice) {
        this.publish({ snapshot, notice: snapshot.selectionError === undefined ? notice : null,
            issue: snapshot.selectionError === undefined ? null : { kind: "domain", ...snapshot.selectionError, source: "selection" } });
    }
}
//# sourceMappingURL=controller.js.map