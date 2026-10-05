import { isProfileId } from "../profile-remote.js";
import { editStructuredPath, moveFallback } from "./structured.js";
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
        applySession: () => this.selectSession(false), resetSession: () => this.selectSession(true),
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
    dispose() { this.disposed = true; this.generation += 1; this.sessionGeneration += 1; this.catalogGeneration += 1; this.catalogRemote = null; this.listeners.clear(); }
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
    async refreshSession() {
        const id = this.current.currentSessionId;
        if (this.disposed || id === null || this.current.sessionBusy !== null)
            return;
        const generation = ++this.sessionGeneration;
        const live = () => !this.disposed && generation === this.sessionGeneration && id === this.current.currentSessionId;
        this.publish({ sessionBusy: "read", sessionIssue: null, sessionNotice: null });
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
            if (live())
                this.publish({ sessionBusy: null });
        }
    }
    async selectSession(reset) {
        const { currentSessionId: id, session, sessionChoice, snapshot } = this.current;
        if (this.disposed || id === null || session === null || !session.switchAllowed || this.current.sessionBusy !== null
            || this.current.busy !== null || this.current.dirty || this.current.pendingEditor !== null)
            return;
        const selectedId = reset ? null : sessionChoice;
        const revision = snapshot?.profiles.find((profile) => profile.id === selectedId)?.revision;
        if (selectedId !== null && revision == null)
            return;
        const generation = ++this.sessionGeneration;
        const live = () => !this.disposed && generation === this.sessionGeneration && id === this.current.currentSessionId;
        this.publish({ sessionBusy: reset ? "reset" : "apply", sessionIssue: null, sessionNotice: null });
        try {
            const accepted = await this.unwrap(this.remote.selectSession(id, {
                sessionId: id, id: selectedId, ...(selectedId === null ? {} : { expectedRevision: revision }),
                expectedSelectionRevision: session.selection.selectionRevision, expectedAdmissionEpoch: session.admissionEpoch,
            }));
            if (accepted.sessionId !== id)
                throw { kind: "assembly", code: "unavailable" };
            if (live())
                this.publish({ session: accepted, sessionChoice: accepted.selection.selectedId, sessionNotice: reset ? "reset" : "applied" });
        }
        catch (error) {
            if (live())
                this.publish({ sessionIssue: this.issue(error) });
        }
        finally {
            if (live())
                this.publish({ sessionBusy: null });
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