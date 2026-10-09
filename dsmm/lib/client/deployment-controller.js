import { equal, editLayer, layerDiff, mergeLayer, record, validateEditorValue } from "./deployment-data.js";
class Refusal extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
async function unwrap(promise) {
    const result = await promise;
    if (result.ok)
        return result.value;
    if (result.error.code === "dsmm-profiles/refused") {
        const code = result.error.details.code;
        throw new Refusal(["conflict", "validation", "not-owned"].includes(code) ? code : "unavailable");
    }
    throw new Refusal("transport");
}
/** Drafts and CAS baselines, never a second configuration authority. */
export class DeploymentController {
    remote;
    layer;
    rowNamespace;
    state = { snapshot: null, draft: {}, dirty: false, busy: false, issue: null, saved: false, session: null };
    listeners = new Set();
    generation = 0;
    disposed = false;
    baseline = {};
    form = null;
    invalid = new Set();
    connection = null;
    connectionBaseline;
    stopConnection = null;
    constructor(remote, layer, rowNamespace = null) {
        this.remote = remote;
        this.layer = layer;
        this.rowNamespace = rowNamespace;
    }
    getSnapshot = () => this.state;
    subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    dispose() { this.disposed = true; this.generation++; this.stopConnection?.(); this.listeners.clear(); this.form = null; }
    bindConnection(source) {
        this.stopConnection?.();
        this.connection = source;
        this.stopConnection = source.subscribe(() => {
            if (this.disposed)
                return;
            this.generation++;
            this.publish({ busy: false, issue: source.getSnapshot() === undefined ? "transport" : "conflict", saved: false });
        });
    }
    forProfile(namespace) {
        const controller = new DeploymentController(this.remote, "profile", namespace);
        if (this.connection !== null)
            controller.bindConnection(this.connection);
        return controller;
    }
    currentConnection() { return this.connection === null || this.connection.getSnapshot() !== undefined && this.connection.getSnapshot() === this.connectionBaseline; }
    setSession(session) { this.publish({ session }); }
    publish(patch) {
        if (this.disposed)
            return;
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    attachForm(form) { this.form = form; }
    setInvalid(path, invalid) {
        if (this.invalid.has(path) === invalid)
            return;
        if (invalid)
            this.invalid.add(path);
        else
            this.invalid.delete(path);
        this.publish({ dirty: this.invalid.size > 0 || !equal(this.baseline, this.state.draft), saved: false });
    }
    canWriteProfile(snapshot = this.state.snapshot) {
        const native = this.form?.state;
        return this.currentConnection() && snapshot !== null && this.rowNamespace !== null && this.rowNamespace === snapshot.namespace
            && native?.status === "ready" && native.mode === "host" && native.writable
            && native.revision === snapshot.nativeFormRevision && snapshot.nativeForm !== null
            && equal(native.base ?? null, snapshot.nativeForm.base) && equal(native.user ?? null, snapshot.nativeForm.user);
    }
    edit(path, value) {
        if (this.state.busy || this.disposed || this.state.snapshot === null || !this.currentConnection() || this.state.issue === "not-owned" || this.layer === "profile" && !this.canWriteProfile())
            return;
        const draft = editLayer(this.state.draft, path, value);
        this.publish({ draft, dirty: this.invalid.size > 0 || !equal(this.baseline, draft), issue: null, saved: false });
    }
    async refresh(discard = false) {
        if (this.disposed || this.state.busy)
            return;
        const generation = ++this.generation;
        const connection = this.connection?.getSnapshot();
        this.publish({ busy: true, saved: false });
        try {
            if (this.connection !== null && connection === undefined)
                throw new Refusal("transport");
            const snapshot = await unwrap(this.remote.describeSettings());
            if (this.disposed || generation !== this.generation)
                return;
            const old = this.state.snapshot;
            if (old !== null && (old.entryId !== snapshot.entryId || old.hostProfileKey !== snapshot.hostProfileKey))
                throw new Refusal("unavailable");
            if (this.state.dirty && !discard) {
                const stale = !this.currentConnection() || (this.layer === "global" ? old?.globalRevision !== snapshot.globalRevision : old?.nativeRevision !== snapshot.nativeRevision || old?.globalRevision !== snapshot.globalRevision);
                this.publish({ issue: stale ? "conflict" : null });
            }
            else {
                this.invalid.clear();
                this.connectionBaseline = connection;
                this.baseline = this.layer === "global" ? snapshot.global : record(snapshot.nativeForm?.user) ? snapshot.nativeForm.user : {};
                this.publish({ snapshot, draft: structuredClone(this.baseline), dirty: false, issue: null });
            }
        }
        catch (error) {
            if (!this.disposed && generation === this.generation)
                this.publish({ issue: error instanceof Refusal ? error.code : "transport" });
        }
        finally {
            if (!this.disposed && generation === this.generation)
                this.publish({ busy: false });
        }
    }
    async save() {
        const { snapshot, draft, dirty, busy, issue } = this.state;
        if (this.disposed || snapshot === null || !dirty || busy || issue !== null || !this.currentConnection() || this.invalid.size > 0 || this.layer === "profile" && !this.canWriteProfile())
            return;
        const schema = this.layer === "global" ? snapshot.schema : { ...snapshot.schema, fields: Object.fromEntries(Object.entries(snapshot.schema.fields ?? {}).filter(([key]) => key !== "modules")) };
        const editable = { ...draft };
        if (this.layer === "profile") {
            if (!equal(editable.sessionPersistence, this.baseline.sessionPersistence)) {
                this.publish({ issue: "validation" });
                return;
            }
            delete editable.sessionPersistence;
        }
        const lower = this.layer === "global" ? snapshot.defaults : mergeLayer(mergeLayer(snapshot.defaults, snapshot.global), snapshot.nativeForm?.base ?? {});
        const merged = mergeLayer(lower, editable);
        delete merged.sessionPersistence;
        if (!validateEditorValue(editable, schema, true) || !validateEditorValue(merged, snapshot.schema)) {
            this.publish({ issue: "validation" });
            return;
        }
        const edits = layerDiff(this.baseline, draft);
        if (edits.length > 128) {
            this.publish({ issue: "validation" });
            return;
        }
        const generation = ++this.generation;
        this.publish({ busy: true, saved: false });
        try {
            const current = await unwrap(this.remote.describeSettings());
            if (this.disposed || generation !== this.generation)
                return;
            if (current.entryId !== snapshot.entryId || current.hostProfileKey !== snapshot.hostProfileKey || current.globalRevision !== snapshot.globalRevision)
                throw new Refusal("conflict");
            if (this.layer === "global")
                await unwrap(this.remote.save({ expectedRevision: snapshot.globalRevision, edits }));
            else {
                if (current.nativeRevision !== snapshot.nativeRevision || !this.canWriteProfile(current))
                    throw new Refusal("conflict");
                const form = this.form;
                if (!await form.mutate(edits, snapshot.nativeFormRevision))
                    throw new Refusal("conflict");
            }
            if (this.disposed || generation !== this.generation)
                return;
            this.baseline = structuredClone(draft);
            this.publish({ dirty: false, saved: true, issue: null });
            // A successful durable save remains successful even if the follow-up read fails.
            try {
                const next = await unwrap(this.remote.describeSettings());
                if (!this.disposed && generation === this.generation)
                    this.publish({ snapshot: next });
            }
            catch {
                if (!this.disposed && generation === this.generation)
                    this.publish({ issue: "unavailable" });
            }
        }
        catch (error) {
            if (!this.disposed && generation === this.generation)
                this.publish({ issue: error instanceof Refusal ? error.code : "transport" });
        }
        finally {
            if (!this.disposed && generation === this.generation)
                this.publish({ busy: false });
        }
    }
}
//# sourceMappingURL=deployment-controller.js.map