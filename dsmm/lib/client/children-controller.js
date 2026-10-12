import { ROLE_CONTROL_REMOTE, parseChildSessionSnapshot, parseRoleControlDescendants, parseRoleControlErrorInfo, parseRoleControlPromptRequest } from "../role-control-remote.js";
export const EMPTY_CHILD_DRAFT = { text: "", delivery: "queue", images: [], imageBusy: false, uncertain: false };
export const childActionKey = (childId) => `child:${childId}`;
export const runActionKey = (toolCallId, runId) => `run:${JSON.stringify([toolCallId, runId])}`;
export function enabled(availability) { return availability?.enabled === true; }
class ControlFailure extends Error {
    safe;
    constructor(safe) {
        super("Child control refused.");
        this.safe = safe;
    }
}
/** Client presentation/draft state only. Host owns all run, inbox and admission authority. */
export class ChildrenController {
    remote;
    current = { sessionId: null, generation: 0, snapshot: null, descendants: null, fresh: false, reading: false,
        issue: null, descendantIssue: null, drafts: new Map(), pending: new Map(), issues: new Map(), outcomes: new Map() };
    owner = null;
    connection = null;
    connectionGeneration;
    observedAdmission = null;
    disposed = false;
    listeners = new Set();
    store = {
        getSnapshot: () => this.current,
        subscribe: (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; },
    };
    actions = {
        refresh: generation => this.refresh(generation), background: (generation, call, run) => this.background(generation, call, run),
        prompt: (generation, child) => this.prompt(generation, child), interrupt: (generation, child) => this.interrupt(generation, child),
        editText: (generation, child, text) => this.editDraft(generation, child, { text }),
        setDelivery: (generation, child, delivery) => this.editDraft(generation, child, { delivery }),
        addImages: (generation, child, files) => this.addImages(generation, child, files),
        removeImage: (generation, child, image) => { const draft = this.draft(child); if (!draft.imageBusy)
            this.editDraft(generation, child, { images: draft.images.filter(part => part !== image) }); },
        acknowledgeUnknown: (generation, child) => { if (this.available(generation))
            this.editDraft(generation, child, { uncertain: false }); },
    };
    constructor(remote) {
        this.remote = remote;
    }
    dispose() { if (this.disposed)
        return; this.owner = null; this.connection = null; this.fence(false); this.disposed = true; this.listeners.clear(); }
    bindConnection(connection, generation) {
        if (this.disposed || connection === this.connection && generation === this.connectionGeneration)
            return;
        this.connection = connection;
        this.connectionGeneration = generation;
        this.fence(true);
        if (connection !== null)
            void this.refresh(this.current.generation);
    }
    bindScope(sessionId, owner) {
        if (this.disposed || sessionId === this.current.sessionId && owner === this.owner)
            return;
        this.owner = owner;
        this.observedAdmission = null;
        this.fence(false, sessionId);
        if (sessionId !== null && owner !== null)
            void this.refresh(this.current.generation);
    }
    observeAdmission(sessionId, epoch) {
        if (this.disposed || sessionId !== this.current.sessionId || epoch === this.observedAdmission)
            return;
        this.observedAdmission = epoch;
        if (this.current.snapshot?.admissionEpoch === epoch)
            return;
        this.fence(true);
        void this.refresh(this.current.generation);
    }
    publish(patch) {
        if (this.disposed)
            return;
        this.current = { ...this.current, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    fence(preserveDrafts, sessionId = this.current.sessionId) {
        const drafts = new Map();
        if (preserveDrafts)
            for (const [id, draft] of this.current.drafts)
                drafts.set(id, { ...draft, imageBusy: false,
                    uncertain: draft.uncertain || this.current.pending.get(childActionKey(id)) === "prompt" });
        this.publish({ sessionId, generation: this.current.generation + 1, snapshot: preserveDrafts ? this.current.snapshot : null,
            fresh: false, descendants: null, reading: false, drafts, pending: new Map(), issues: new Map(), outcomes: new Map(), issue: null, descendantIssue: null });
    }
    live(generation) { return !this.disposed && generation === this.current.generation && this.owner !== null && this.connection !== null && this.current.sessionId !== null; }
    available(generation) { return this.live(generation) && this.current.fresh && !this.current.reading; }
    draft(id) { return this.current.drafts.get(id) ?? EMPTY_CHILD_DRAFT; }
    child(id) { return this.current.snapshot?.children.find(child => child.id === id && child.parentSessionId === this.current.sessionId); }
    editDraft(generation, id, patch) {
        if (this.disposed || generation !== this.current.generation || this.child(id)?.mode !== "continuable" || this.current.pending.has(childActionKey(id)))
            return;
        this.publishDraft(id, patch);
    }
    publishDraft(id, patch) {
        const drafts = new Map(this.current.drafts);
        drafts.set(id, { ...this.draft(id), ...patch });
        this.publish({ drafts });
    }
    issue(error) {
        if (error instanceof ControlFailure)
            return error.safe;
        return { kind: "transport", code: "unavailable", unknown: true };
    }
    async unwrap(method, call) {
        const result = await call();
        if (!result.ok) {
            if (result.error.code === "dsmm-children/refused") {
                let info;
                try {
                    info = parseRoleControlErrorInfo(result.error.details);
                }
                catch {
                    throw new ControlFailure({ kind: "protocol", code: "unavailable", unknown: true });
                }
                throw new ControlFailure({ kind: "domain", ...info });
            }
            throw new ControlFailure({ kind: "transport", code: "unavailable", unknown: true });
        }
        try {
            const codec = ROLE_CONTROL_REMOTE.descriptors.find(row => row.method === method).result;
            if (codec.mode !== "strict")
                throw new TypeError("Child result requires a strict codec.");
            return codec.create().parse(result.value);
        }
        catch {
            throw new ControlFailure({ kind: "protocol", code: "unavailable", unknown: true });
        }
    }
    async refresh(generation) {
        if (!this.live(generation) || this.current.reading || this.current.pending.size > 0 || [...this.current.drafts.values()].some(draft => draft.imageBusy))
            return;
        const id = this.current.sessionId;
        this.publish({ reading: true, issue: null, descendantIssue: null, fresh: false });
        const [description, descendants] = await Promise.allSettled([this.unwrap("describe", () => this.remote.describe(id)), this.unwrap("descendants", () => this.remote.descendants(id))]);
        if (!this.live(generation))
            return;
        if (description.status === "rejected") {
            this.publish({ reading: false, issue: this.issue(description.reason), descendants: null });
            return;
        }
        const snapshot = parseChildSessionSnapshot(description.value);
        if (snapshot.sessionId !== id) {
            this.publish({ reading: false, issue: { kind: "protocol", code: "not-owned" }, descendants: null });
            return;
        }
        if (this.observedAdmission !== null && snapshot.admissionEpoch !== this.observedAdmission) {
            this.publish({ reading: false, issue: { kind: "protocol", code: "conflict" }, descendants: null });
            return;
        }
        let tree = null, descendantIssue = null;
        if (descendants.status === "rejected")
            descendantIssue = this.issue(descendants.reason);
        else {
            tree = parseRoleControlDescendants(descendants.value);
            if (tree.sessionId !== id || tree.admissionEpoch !== snapshot.admissionEpoch) {
                tree = null;
                descendantIssue = { kind: "protocol", code: "conflict" };
            }
        }
        this.publish({ snapshot, descendants: tree, descendantIssue, fresh: true, reading: false, generation: generation + 1 });
    }
    begin(key, kind) {
        const pending = new Map(this.current.pending), issues = new Map(this.current.issues), outcomes = new Map(this.current.outcomes);
        pending.set(key, kind);
        issues.delete(key);
        outcomes.delete(key);
        this.publish({ pending, issues, outcomes });
    }
    finish(key) { const pending = new Map(this.current.pending); pending.delete(key); this.publish({ pending }); }
    refuse(key, error) { const issues = new Map(this.current.issues); issues.set(key, this.issue(error)); this.publish({ issues }); }
    accepted(key, outcome) { const outcomes = new Map(this.current.outcomes); outcomes.set(key, outcome); this.publish({ outcomes }); }
    async background(generation, toolCallId, runId) {
        const key = runActionKey(toolCallId, runId), snapshot = this.current.snapshot;
        const run = snapshot?.runs.find(row => row.toolCallId === toolCallId && row.invocation?.runId === runId);
        if (!this.available(generation) || this.current.pending.has(key) || this.current.outcomes.get(key)?.kind === "background"
            || run?.state !== "running" || !enabled(run.background) || !enabled(snapshot?.capabilities.background))
            return;
        this.begin(key, "background");
        try {
            const receipt = await this.unwrap("background", () => this.remote.background(snapshot.sessionId, { sessionId: snapshot.sessionId, toolCallId, runId, expectedAdmissionEpoch: snapshot.admissionEpoch }));
            if (!this.live(generation))
                return;
            if (receipt.runId !== runId)
                throw new ControlFailure({ kind: "protocol", code: "conflict", unknown: true });
            this.accepted(key, { kind: "background", receipt });
        }
        catch (error) {
            if (this.live(generation))
                this.refuse(key, error);
        }
        finally {
            if (this.live(generation))
                this.finish(key);
        }
    }
    canControl(generation, id, action) {
        const child = this.child(id);
        return this.available(generation) && !this.current.pending.has(childActionKey(id)) && child?.mode === "continuable" && !child.readonly
            && enabled(child.controls[action]) && enabled(this.current.snapshot?.capabilities[action]);
    }
    async prompt(generation, id) {
        const draft = this.draft(id), key = childActionKey(id);
        if (!this.canControl(generation, id, "prompt") || draft.uncertain || draft.imageBusy || draft.text.trim() === "" && draft.images.length === 0
            || draft.images.length > 0 && !enabled(this.current.snapshot?.capabilities.images))
            return;
        this.begin(key, "prompt");
        try {
            let clientTimeZone;
            try {
                clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            }
            catch { /* Omission delegates to native zone handling. */ }
            let request;
            try {
                request = parseRoleControlPromptRequest({ requestId: crypto.randomUUID(), parentSessionId: this.current.sessionId, childSessionId: id, mode: "continuable", delivery: draft.delivery,
                    content: [...(draft.text === "" ? [] : [{ type: "text", text: draft.text }]), ...draft.images], ...(clientTimeZone === undefined ? {} : { clientTimeZone }) });
            }
            catch {
                throw new ControlFailure({ kind: "local", code: "invalid-content" });
            }
            const receipt = await this.unwrap("prompt", () => this.remote.prompt(this.current.sessionId, request));
            if (!this.live(generation))
                return;
            this.accepted(key, { kind: "prompt", receipt });
            const drafts = new Map(this.current.drafts);
            drafts.set(id, { ...draft, text: "", images: [], uncertain: false });
            this.publish({ drafts });
        }
        catch (error) {
            if (this.live(generation)) {
                const issue = this.issue(error);
                this.refuse(key, error);
                if (issue.unknown) {
                    const drafts = new Map(this.current.drafts);
                    drafts.set(id, { ...this.draft(id), uncertain: true });
                    this.publish({ drafts });
                }
            }
        }
        finally {
            if (this.live(generation))
                this.finish(key);
        }
    }
    async interrupt(generation, id) {
        if (!this.canControl(generation, id, "interrupt"))
            return;
        const key = childActionKey(id);
        this.begin(key, "interrupt");
        try {
            const receipt = await this.unwrap("interrupt", () => this.remote.interrupt(this.current.sessionId, { parentSessionId: this.current.sessionId, childSessionId: id, mode: "continuable" }));
            if (this.live(generation))
                this.accepted(key, { kind: "interrupt", receipt });
        }
        catch (error) {
            if (this.live(generation))
                this.refuse(key, error);
        }
        finally {
            if (this.live(generation))
                this.finish(key);
        }
    }
    async addImages(generation, id, files) {
        if (!this.canControl(generation, id, "prompt") || !enabled(this.current.snapshot?.capabilities.images) || this.draft(id).imageBusy || files.length === 0)
            return;
        this.editDraft(generation, id, { imageBusy: true });
        try {
            const images = [];
            for (const file of files) {
                const bytes = new Uint8Array(await file.arrayBuffer());
                if (!this.live(generation))
                    return;
                let body = "";
                for (const byte of bytes)
                    body += String.fromCharCode(byte);
                const parsed = parseRoleControlPromptRequest({ requestId: "image-intake", parentSessionId: this.current.sessionId, childSessionId: id, mode: "continuable", delivery: "queue",
                    content: [{ type: "image", mediaType: file.type, data: btoa(body), name: file.name }] });
                images.push(parsed.content[0]);
            }
            if (this.live(generation))
                this.publishDraft(id, { images: [...this.draft(id).images, ...images] });
        }
        catch {
            if (this.live(generation))
                this.refuse(childActionKey(id), new ControlFailure({ kind: "local", code: "invalid-content" }));
        }
        finally {
            if (this.live(generation))
                this.publishDraft(id, { imageBusy: false });
        }
    }
}
//# sourceMappingURL=children-controller.js.map