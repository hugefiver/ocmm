import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";
import { parseTree } from "jsonc-parser";
import { ABSENT_PROFILE_SELECTION_REVISION } from "./profile-types.js";
import { DsmmProfileError, MAX_PROFILE_BYTES, MAX_PROFILE_COUNT, MAX_PROFILE_DIRECTORY_ENTRIES, MAX_PROFILE_REVISIONS, parseProfileDocument, profileErrorInfo, validateProfileId, validateProfileRevision } from "./profiles.js";
export const MAX_SESSION_PROFILE_CHOICES = 1024;
const trustedLayout = Symbol("trusted profile storage layout");
const LEGACY_WRITE_RESTRICTION = "Legacy profiles are read-only. Explicitly import them before saving or changing selections.";
/** This directory is supplied by the Host, never by a remote method parameter. */
export class ProfileStore {
    profileDir;
    stateDir;
    timeoutMs;
    pollMs;
    rename;
    rootIdentity;
    origin;
    hostProfile;
    identities = new Map();
    constructor(profileDir, options = {}) {
        const layout = options[trustedLayout];
        if (!isAbsolute(profileDir) || dirname(resolve(profileDir)) === resolve(profileDir) || (layout === undefined && basename(resolve(profileDir)) !== "dsmm-profiles")) {
            throw new DsmmProfileError("unsafe-path", "The Host must supply its native profile's dsmm-profiles directory.");
        }
        this.profileDir = resolve(profileDir);
        this.stateDir = layout?.stateDir ?? this.profileDir;
        this.origin = layout?.origin ?? "explicit";
        this.hostProfile = layout?.hostProfile;
        this.timeoutMs = boundedOption(options.lockTimeoutMs, 2000, 0, 30000);
        this.pollMs = boundedOption(options.lockPollMs, 25, 1, 1000);
        this.rename = options.rename ?? renameSync;
    }
    static fromCentral(home, canonicalHostProfile, actualEntryId, options = {}) {
        const root = trustedHome(home);
        validateTrustedDirectoryPath(canonicalHostProfile);
        if (resolve(canonicalHostProfile) !== canonicalHostProfile)
            throw new DsmmProfileError("unsafe-path", "A canonical Host profile identity is required.");
        validateDirectories(canonicalHostProfile, false);
        if (typeof actualEntryId !== "string" || actualEntryId.length < 1 || actualEntryId.length > 256 || actualEntryId.trim().length === 0
            || /[\u0000-\u001f\u007f]/u.test(actualEntryId) || Buffer.from(actualEntryId, "utf8").toString("utf8") !== actualEntryId) {
            throw new DsmmProfileError("validation", "A bounded native entry identity is required.", "actualEntryId");
        }
        const identity = process.platform === "win32" ? canonicalHostProfile.toLowerCase() : canonicalHostProfile;
        const profileDir = join(root, "plugins", "dsmm", "profiles");
        const stateDir = join(profileDir, ".state", digest(Buffer.from(JSON.stringify([identity, actualEntryId]), "utf8")));
        const trusted = { ...options, [trustedLayout]: { origin: "central", stateDir, hostProfile: canonicalHostProfile } };
        const store = new ProfileStore(profileDir, trusted);
        store.validateRoot(false);
        store.validateState(false);
        return store;
    }
    static fromLegacy(legacyDir, options = {}) {
        validateTrustedDirectoryPath(legacyDir);
        if (basename(resolve(legacyDir)) !== "dsmm-profiles")
            throw new DsmmProfileError("unsafe-path", "The legacy store must be the Host's exact dsmm-profiles directory.");
        const root = resolve(legacyDir);
        const trusted = { ...options, [trustedLayout]: { origin: "legacy", stateDir: root } };
        const store = new ProfileStore(root, trusted);
        store.validateRoot(false);
        return store;
    }
    async describe() {
        return this.readOperation(() => {
            const entries = this.inventory();
            const profiles = entries.map((name) => {
                const id = name.slice(0, -6);
                try {
                    validateProfileId(id);
                    if (name !== `${id}.jsonc`)
                        throw new DsmmProfileError("unsafe-path", "Profile filename must use lowercase .jsonc and match its ID.");
                    const draft = this.draft(id, entries);
                    return { id, ...(draft.document.label === undefined ? {} : { label: draft.document.label }), revision: draft.revision };
                }
                catch (error) {
                    return { id: safeInventoryId(id), revision: null, error: profileErrorInfo(error) };
                }
            });
            try {
                const selected = this.selection();
                return { ...this.metadata(), profiles, selectedId: selected.selectedId, appliedRevision: selected.appliedRevision, selectionRevision: selected.selectionRevision };
            }
            catch (error) {
                // An error is not a successful fallback to the baseline.
                return { ...this.metadata(), profiles, selectedId: null, appliedRevision: null, selectionRevision: "unavailable", selectionError: profileErrorInfo(error, "corrupt-selection") };
            }
        });
    }
    async read(id) {
        validateProfileId(id);
        return this.readOperation(() => this.readResult(this.draft(id, this.inventory())));
    }
    async save(request) {
        this.assertWritable();
        validateProfileId(request.id);
        const document = parseProfileDocument(request.content, request.id);
        if (request.expectedRevision !== null)
            validateProfileRevision(request.expectedRevision);
        return this.locked((assertLock) => {
            const entries = this.inventory();
            const name = this.draftName(request.id, entries);
            const current = name === undefined ? undefined : this.draft(request.id, entries);
            if ((current?.revision ?? null) !== request.expectedRevision)
                conflict("The profile changed since it was opened. Reload it before saving.");
            if (current === undefined && entries.length >= MAX_PROFILE_COUNT)
                throw new DsmmProfileError("limit", "At most 128 Deepwork profiles are supported.");
            const bytes = Buffer.from(request.content, "utf8");
            const target = join(this.profileDir, `${request.id}.jsonc`);
            this.atomicReplace(target, bytes, () => {
                const latestNames = this.inventory();
                const latest = this.draftName(request.id, latestNames) === undefined ? null : this.draft(request.id, latestNames).revision;
                if (latest !== request.expectedRevision)
                    conflict("The profile was edited externally during save. Reload it before saving.");
            }, assertLock);
            return this.readResult({ bytes, content: request.content, revision: digest(bytes), document });
        });
    }
    async loadSelection() {
        return this.readOperation(() => this.selection());
    }
    async loadSessionSelection(sessionId) {
        validateSessionProfileId(sessionId);
        return this.readOperation(() => this.sessionSelection(sessionId));
    }
    async selectSession(request, epoch, validateCandidate, commit) {
        this.assertWritable();
        validateSessionProfileId(request.sessionId);
        validateSelectionRequest(request);
        validateProfileRevision(epoch, "admissionEpoch");
        return this.locked(async (assertLock) => {
            commit.assertCurrent();
            if (this.sessionSelection(request.sessionId).selectionRevision !== request.expectedSelectionRevision)
                conflict("The session profile changed. Refresh before selecting again.");
            const draft = request.id === null ? undefined : this.draft(request.id, this.inventory());
            if (draft !== undefined && draft.revision !== request.expectedRevision)
                conflict("The profile changed before selection. Reload and select its latest revision.");
            let prepared;
            try {
                prepared = await validateCandidate(draft === undefined ? null : structuredClone(draft.document));
            }
            catch (error) {
                if (error instanceof DsmmProfileError)
                    throw error;
                throw new DsmmProfileError("activation", "The candidate profile could not be activated; the previous session selection was retained.");
            }
            const directory = join(this.stateDir, ".sessions");
            const target = join(directory, `${sessionChoiceKey(request.sessionId)}.json`);
            const fence = (temporary) => {
                commit.assertCurrent();
                if (this.sessionSelection(request.sessionId, temporary).selectionRevision !== request.expectedSelectionRevision)
                    conflict("The session selection was edited externally. Refresh before selecting again.");
                if (draft !== undefined && this.draft(request.id, this.inventory()).revision !== draft.revision)
                    conflict("The draft changed during activation. Reload and select again.");
                validateDirectories(directory, false, false, this.identities);
                // The one exclusive atomic staging file is not a session choice.
                const entries = boundedEntries(directory, MAX_SESSION_PROFILE_CHOICES + (temporary === undefined ? 0 : 1))
                    .filter((name) => temporary === undefined || name !== basename(temporary));
                if (status(target) === undefined && entries.length >= MAX_SESSION_PROFILE_CHOICES)
                    throw new DsmmProfileError("limit", "The session profile choice inventory is full; no selection was committed.");
            };
            assertLock();
            commit.assertCurrent();
            validateDirectories(directory, true, false, this.identities);
            fence();
            if (draft !== undefined)
                this.publishRevision(draft, assertLock);
            const pointer = { version: 1, sessionId: request.sessionId, id: request.id, revision: draft?.revision ?? null, epoch };
            const bytes = Buffer.from(`${JSON.stringify(pointer)}\n`, "utf8");
            const selection = { sessionId: request.sessionId, admissionEpoch: epoch,
                selectedId: request.id, appliedRevision: draft?.revision ?? null, selectionRevision: digest(bytes), document: draft?.document ?? null, content: draft?.content ?? null };
            this.atomicReplace(target, bytes, fence, assertLock);
            commit.committed(selection, prepared);
            return { selection, prepared };
        });
    }
    async select(request, validateCandidate) {
        this.assertWritable();
        validateSelectionRequest(request);
        return this.locked(async (assertLock) => {
            const current = this.selection();
            if (current.selectionRevision !== request.expectedSelectionRevision)
                conflict("The selected profile changed. Refresh before selecting again.");
            const draft = request.id === null ? undefined : this.draft(request.id, this.inventory());
            if (draft !== undefined && draft.revision !== request.expectedRevision)
                conflict("The profile changed before selection. Reload and select its latest revision.");
            let prepared;
            try {
                prepared = await validateCandidate?.(draft === undefined ? null : structuredClone(draft.document));
            }
            catch (error) {
                if (error instanceof DsmmProfileError)
                    throw error;
                throw new DsmmProfileError("activation", "The candidate profile could not be activated; the previous selection was retained.");
            }
            // The audit may await native work. Recheck security and CAS afterwards.
            assertLock();
            this.assertSelectionRevision(request.expectedSelectionRevision);
            if (draft !== undefined && this.draft(request.id, this.inventory()).revision !== draft.revision)
                conflict("The draft changed during activation. Reload and select again.");
            if (draft !== undefined)
                this.publishRevision(draft, assertLock);
            const pointer = { version: 1, id: request.id, revision: draft?.revision ?? null };
            const bytes = Buffer.from(`${JSON.stringify(pointer)}\n`, "utf8");
            this.validateState(true);
            this.atomicReplace(join(this.stateDir, ".selection.json"), bytes, () => {
                this.assertSelectionRevision(request.expectedSelectionRevision);
                if (draft !== undefined && this.draft(request.id, this.inventory()).revision !== draft.revision)
                    conflict("The draft changed during selection. Reload and select again.");
            }, assertLock);
            return {
                selection: { selectedId: request.id, appliedRevision: draft?.revision ?? null, selectionRevision: digest(bytes), document: draft?.document ?? null, content: draft?.content ?? null },
                prepared
            };
        });
    }
    readResult(draft) {
        return { id: draft.document.id, ...(draft.document.label === undefined ? {} : { label: draft.document.label }), revision: draft.revision, content: draft.content };
    }
    inventory() {
        if (!this.validateRoot(false))
            return [];
        const names = boundedEntries(this.profileDir, MAX_PROFILE_DIRECTORY_ENTRIES).filter((name) => !name.startsWith(".") && /\.jsonc$/iu.test(name)).sort();
        if (names.length > MAX_PROFILE_COUNT)
            throw new DsmmProfileError("limit", "Profile inventory exceeds the 128-profile limit.");
        const seen = new Set();
        for (const name of names) {
            const key = name.toLowerCase();
            if (seen.has(key))
                throw new DsmmProfileError("unsafe-path", "Profile filenames collide case-insensitively; rename the conflicting files manually.");
            seen.add(key);
        }
        return names;
    }
    draftName(id, entries) {
        const expected = `${id}.jsonc`;
        const found = entries.find((name) => name.toLowerCase() === expected);
        if (found !== undefined && found !== expected)
            throw new DsmmProfileError("unsafe-path", "An existing profile has a conflicting filename case; rename it manually.");
        return found;
    }
    draft(id, entries) {
        validateProfileId(id);
        const name = this.draftName(id, entries);
        if (name === undefined)
            throw new DsmmProfileError("not-found", "The requested Deepwork profile does not exist.");
        const file = regularFile(join(this.profileDir, name), MAX_PROFILE_BYTES);
        return { ...file, document: parseProfileDocument(file.content, id) };
    }
    selection() {
        this.validateRoot(false);
        this.validateState(false);
        const path = join(this.stateDir, ".selection.json");
        if (status(path) === undefined) {
            if (this.origin === "legacy")
                throw new DsmmProfileError("corrupt-selection", "The legacy selection is missing. Restore its original pointer and immutable revision explicitly.");
            return { selectedId: null, appliedRevision: null, selectionRevision: ABSENT_PROFILE_SELECTION_REVISION, document: null, content: null };
        }
        try {
            const file = regularFile(path, 1024);
            const pointer = parseSelectionPointer(file.content);
            if (pointer.id === null)
                return { selectedId: null, appliedRevision: null, selectionRevision: file.revision, document: null, content: null };
            validateDirectories(join(this.profileDir, ".revisions"), false);
            const immutable = regularFile(join(this.profileDir, ".revisions", `${pointer.revision}.jsonc`), MAX_PROFILE_BYTES);
            if (immutable.revision !== pointer.revision)
                throw new DsmmProfileError("corrupt-selection", "The selected immutable profile revision failed its SHA256 verification.");
            const document = parseProfileDocument(immutable.content, pointer.id);
            return { selectedId: pointer.id, appliedRevision: pointer.revision, selectionRevision: file.revision, document, content: immutable.content };
        }
        catch (error) {
            if (error instanceof DsmmProfileError && error.code === "unsafe-path")
                throw error;
            throw new DsmmProfileError("corrupt-selection", "The selected profile pointer or immutable revision is missing or invalid. Repair it explicitly; the baseline was not silently selected.");
        }
    }
    sessionSelection(sessionId, temporary) {
        this.validateRoot(false);
        this.validateState(false);
        const absent = { sessionId, admissionEpoch: null, selectedId: null, appliedRevision: null,
            selectionRevision: ABSENT_PROFILE_SELECTION_REVISION, document: null, content: null };
        const directory = join(this.stateDir, ".sessions");
        if (status(directory) === undefined)
            return absent;
        validateDirectories(directory, false);
        const entries = boundedEntries(directory, MAX_SESSION_PROFILE_CHOICES + (temporary === undefined ? 0 : 1))
            .filter((name) => temporary === undefined || name !== basename(temporary));
        if (entries.length > MAX_SESSION_PROFILE_CHOICES)
            throw new DsmmProfileError("limit", "The session profile choice inventory exceeds its supported limit.");
        const path = join(directory, `${sessionChoiceKey(sessionId)}.json`);
        if (status(path) === undefined)
            return absent;
        try {
            const file = regularFile(path, 2048);
            const pointer = parseSessionSelectionPointer(file.content, sessionId);
            if (pointer.id === null)
                return { ...absent, admissionEpoch: pointer.epoch, selectionRevision: file.revision };
            validateDirectories(join(this.profileDir, ".revisions"), false);
            const immutable = regularFile(join(this.profileDir, ".revisions", `${pointer.revision}.jsonc`), MAX_PROFILE_BYTES);
            if (immutable.revision !== pointer.revision)
                throw new DsmmProfileError("corrupt-selection", "The session's immutable profile revision failed SHA256 verification.");
            return { sessionId, admissionEpoch: pointer.epoch, selectedId: pointer.id, appliedRevision: pointer.revision,
                selectionRevision: file.revision, document: parseProfileDocument(immutable.content, pointer.id), content: immutable.content };
        }
        catch (error) {
            if (error instanceof DsmmProfileError && error.code === "unsafe-path")
                throw error;
            throw new DsmmProfileError("corrupt-selection", "The session profile choice or immutable revision is missing or invalid. Repair it explicitly; no global or baseline fallback was admitted.");
        }
    }
    assertSelectionRevision(expected) {
        if (this.selection().selectionRevision !== expected)
            conflict("The selection was edited externally. Refresh before selecting again.");
    }
    publishRevision(draft, assertLock) {
        assertLock();
        const directory = join(this.profileDir, ".revisions");
        validateDirectories(directory, true);
        const path = join(directory, `${draft.revision}.jsonc`);
        if (status(path) !== undefined) {
            const existing = regularFile(path, MAX_PROFILE_BYTES);
            if (existing.revision !== draft.revision || !existing.bytes.equals(draft.bytes))
                throw new DsmmProfileError("corrupt-selection", "An immutable profile revision has been altered; no selection was committed.");
            return;
        }
        if (boundedEntries(directory, MAX_PROFILE_REVISIONS).length >= MAX_PROFILE_REVISIONS)
            throw new DsmmProfileError("limit", "The immutable revision inventory is full; no selection was committed.");
        let fd;
        let created = false;
        try {
            assertLock();
            fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
            created = true;
            writeAll(fd, draft.bytes);
            fsyncSync(fd);
            closeSync(fd);
            fd = undefined;
        }
        catch (error) {
            if (fd !== undefined)
                closeSync(fd);
            if (created)
                unlinkSync(path);
            throw error;
        }
    }
    atomicReplace(target, bytes, beforeRename, assertLock) {
        atomicReplace(target, bytes, beforeRename, () => {
            assertLock();
            validateDirectories(dirname(target), false, false, this.identities);
        }, this.rename);
    }
    validateRoot(create) {
        if (this.hostProfile !== undefined)
            validateDirectories(this.hostProfile, false, false, this.identities);
        if (!validateDirectories(this.profileDir, create, this.origin === "central", this.identities))
            return false;
        const current = lstatSync(this.profileDir);
        if (this.rootIdentity !== undefined && !sameFile(this.rootIdentity, current)) {
            throw new DsmmProfileError("unsafe-path", "The profile storage directory was replaced during this Host's lifetime; no operation was committed.");
        }
        this.rootIdentity ??= current;
        return true;
    }
    validateState(create) {
        return validateDirectories(this.stateDir, create, this.origin === "central", this.identities);
    }
    metadata() {
        return { origin: this.origin, readOnly: this.origin === "legacy", ...(this.origin === "legacy" ? { writeRestriction: LEGACY_WRITE_RESTRICTION } : {}) };
    }
    get readOnly() { return this.origin === "legacy"; }
    get writeRestriction() { return this.readOnly ? LEGACY_WRITE_RESTRICTION : undefined; }
    assertWritable() {
        if (this.origin === "legacy")
            throw new DsmmProfileError("unavailable", LEGACY_WRITE_RESTRICTION);
    }
    async readOperation(operation) {
        if (this.origin === "explicit")
            return this.locked(operation);
        try {
            const first = operation();
            const second = operation();
            this.validateRoot(false);
            this.validateState(false);
            if (JSON.stringify(first) !== JSON.stringify(second)) {
                throw new DsmmProfileError(this.origin === "legacy" ? "corrupt-selection" : "conflict", "Profile storage changed during the read. No selection was admitted; retry after it is stable.");
            }
            return second;
        }
        catch (error) {
            if (error instanceof DsmmProfileError)
                throw error;
            throw new DsmmProfileError("io", "Deepwork profile storage could not be read safely.");
        }
    }
    async locked(operation) {
        this.assertWritable();
        return locked(this.profileDir, ".lock", (create) => { this.validateRoot(create); }, this.timeoutMs, this.pollMs, operation);
    }
}
async function locked(directory, lockName, validateRoot, timeoutMs, pollMs, operation) {
    let fd;
    let ownedStatus;
    let ownedBytes;
    const lockPath = join(directory, lockName);
    const assertLock = () => {
        validateRoot(false);
        const current = status(lockPath);
        if (fd === undefined || ownedStatus === undefined || ownedBytes === undefined || current === undefined || !sameFile(ownedStatus, current) || !sameFile(ownedStatus, fstatSync(fd))) {
            conflict("Profile lock ownership changed during this operation. No selection was committed; retry after the current owner finishes.");
        }
        assertRegular(current);
        assertRegular(fstatSync(fd));
        if (!regularFile(lockPath, 256).bytes.equals(ownedBytes))
            conflict("The profile lock was altered during this operation. No selection was committed; retry after the current owner finishes.");
    };
    try {
        validateRoot(true);
        const deadline = performance.now() + timeoutMs;
        for (;;) {
            validateRoot(false);
            try {
                fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
                ownedStatus = fstatSync(fd);
                ownedBytes = Buffer.from(`${process.pid} ${randomUUID()}\n`, "utf8");
                writeAll(fd, ownedBytes);
                fsyncSync(fd);
                break;
            }
            catch (error) {
                if (fd !== undefined || errorCode(error) !== "EEXIST")
                    throw error;
                const existing = status(lockPath);
                if (existing !== undefined)
                    assertRegular(existing);
                if (performance.now() >= deadline)
                    throw new DsmmProfileError("lock-timeout", "Another process owns the profile lock. Retry after it finishes; locks are never stolen.");
                await new Promise((done) => setTimeout(done, Math.min(pollMs, Math.max(1, deadline - performance.now()))));
            }
        }
        assertLock();
        return await operation(assertLock);
    }
    catch (error) {
        if (error instanceof DsmmProfileError)
            throw error;
        throw new DsmmProfileError("io", "Deepwork profile storage failed. Existing files and the previous selection were retained.");
    }
    finally {
        if (fd !== undefined) {
            try {
                closeSync(fd);
            }
            catch { /* A committed pointer must remain a successful transaction. */ }
            try {
                validateRoot(false);
                const current = status(lockPath);
                if (ownedStatus !== undefined && ownedBytes !== undefined && current !== undefined && sameFile(ownedStatus, current) && current.isFile() && !current.isSymbolicLink() && regularFile(lockPath, 256).bytes.equals(ownedBytes))
                    unlinkSync(lockPath);
            }
            catch { /* Do not delete a replacement lock or traverse an altered root. */ }
        }
    }
}
function atomicReplace(target, bytes, beforeRename, assertAuthority, rename, assertCurrent) {
    assertAuthority();
    if (status(target) !== undefined)
        assertRegular(status(target));
    const temporary = join(dirname(target), `.dsmm-tmp-${randomUUID()}`);
    let fd;
    let created = false;
    let owned;
    try {
        fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
        created = true;
        owned = fstatSync(fd);
        assertRegular(owned);
        writeAll(fd, bytes);
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        assertAuthority();
        if (status(target) !== undefined)
            assertRegular(status(target));
        beforeRename(temporary);
        assertAuthority();
        const staged = regularFile(temporary, bytes.length);
        if (!sameFile(owned, lstatSync(temporary)) || !staged.bytes.equals(bytes))
            conflict("The staged file changed before commit. No file was replaced.");
        assertCurrent?.();
        rename(temporary, target);
        created = false;
        // rename is the transaction commit. No fallible work follows it.
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
        if (created) {
            try {
                assertAuthority();
                const current = status(temporary);
                if (owned !== undefined && current !== undefined && sameFile(owned, current))
                    unlinkSync(temporary);
            }
            catch { /* Never traverse an altered root or remove another owner's staging file. */ }
        }
    }
}
function validateTrustedDirectoryPath(path) {
    if (typeof path !== "string" || path.length > 4096 || !isAbsolute(path) || /[\u0000-\u001f\u007f]/u.test(path)
        || Buffer.from(path, "utf8").toString("utf8") !== path || dirname(resolve(path)) === resolve(path)) {
        throw new DsmmProfileError("unsafe-path", "A bounded absolute trusted Host directory is required.");
    }
}
function trustedHome(home) {
    validateTrustedDirectoryPath(home);
    const root = resolve(home);
    validateDirectories(root, false, true);
    return root;
}
/** @internal Shared only by the fixed config file adapter; not a wire-path storage API. */
export const profileStoreFilePrimitives = { trustedHome, validateDirectories, status, regularFile, digest, boundedOption, locked, atomicReplace };
function boundedOption(value, fallback, minimum, maximum) {
    if (value === undefined)
        return fallback;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
        throw new DsmmProfileError("validation", "Profile lock timing is outside supported bounds.");
    return value;
}
function digest(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
function errorCode(error) {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
function status(path) {
    try {
        return lstatSync(path);
    }
    catch (error) {
        if (errorCode(error) === "ENOENT")
            return undefined;
        throw error;
    }
}
function validateDirectories(directory, create, allowMissing = false, identities) {
    const absolute = resolve(directory);
    const root = parse(absolute).root;
    const parts = [];
    for (let current = absolute; current !== root; current = dirname(current))
        parts.unshift(current);
    parts.unshift(root);
    for (const path of parts) {
        let found = status(path);
        if (found === undefined && identities?.has(path))
            throw new DsmmProfileError("unsafe-path", "A pinned storage directory disappeared; storage authority was invalidated.");
        if (found === undefined && create) {
            try {
                mkdirSync(path, { mode: 0o700 });
            }
            catch (error) {
                if (errorCode(error) !== "EEXIST")
                    throw error;
            }
            found = status(path);
        }
        if (found === undefined && allowMissing) {
            return false;
        }
        if (found === undefined || found.isSymbolicLink() || !found.isDirectory())
            throw new DsmmProfileError("unsafe-path", "Profile directories and every ancestor must be real directories, not links or junctions.");
        const canonical = resolve(realpathSync(path));
        if ((process.platform === "win32" ? canonical.toLowerCase() : canonical) !== (process.platform === "win32" ? path.toLowerCase() : path)) {
            throw new DsmmProfileError("unsafe-path", "Profile storage must not traverse redirected directories or reparse points.");
        }
        const pinned = identities?.get(path);
        if (pinned !== undefined && !sameFile(pinned, found))
            throw new DsmmProfileError("unsafe-path", "A storage directory was replaced; storage authority was invalidated.");
        identities?.set(path, found);
    }
    return true;
}
function assertRegular(found) {
    if (found.isSymbolicLink() || !found.isFile() || found.nlink !== 1)
        throw new DsmmProfileError("unsafe-path", "Profile files and lock files must be regular, unlinked files, not symlinks, junctions, directories or hard links.");
}
function sameFile(first, second) {
    return first.dev === second.dev && first.ino === second.ino;
}
function regularFile(path, maximum) {
    validateDirectories(dirname(path), false);
    const before = status(path);
    if (before === undefined)
        throw new DsmmProfileError("not-found", "The required profile file does not exist.");
    assertRegular(before);
    if (before.size > maximum)
        throw new DsmmProfileError("limit", "Profile storage contains an oversized file.");
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
        validateDirectories(dirname(path), false);
        const opened = fstatSync(fd);
        assertRegular(opened);
        if (!sameFile(before, opened))
            conflict("The profile file changed while it was opened. Retry the operation.");
        const buffer = Buffer.alloc(maximum + 1);
        let size = 0;
        while (size < buffer.length) {
            const count = readSync(fd, buffer, size, buffer.length - size, size);
            if (count === 0)
                break;
            size += count;
        }
        if (size > maximum)
            throw new DsmmProfileError("limit", "Profile storage contains an oversized file.");
        const after = fstatSync(fd);
        const named = status(path);
        validateDirectories(dirname(path), false);
        assertRegular(after);
        if (named !== undefined)
            assertRegular(named);
        if (named === undefined || !sameFile(opened, named) || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || opened.ctimeMs !== after.ctimeMs)
            conflict("The profile file was edited while being read. Retry the operation.");
        const bytes = buffer.subarray(0, size);
        let content;
        try {
            content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        }
        catch {
            throw new DsmmProfileError("validation", "Profile files must contain valid UTF-8 text.", "content");
        }
        return { bytes, content, revision: digest(bytes) };
    }
    finally {
        closeSync(fd);
    }
}
function boundedEntries(directory, maximum) {
    const handle = opendirSync(directory);
    const entries = [];
    try {
        for (;;) {
            const entry = handle.readSync();
            if (entry === null)
                break;
            if (entries.length >= maximum)
                throw new DsmmProfileError("limit", "Profile storage inventory exceeds its supported limit.");
            entries.push(entry.name);
        }
    }
    finally {
        handle.closeSync();
    }
    return entries;
}
function writeAll(fd, bytes) {
    let offset = 0;
    while (offset < bytes.length) {
        const count = writeSync(fd, bytes, offset, bytes.length - offset);
        if (count === 0)
            throw new Error("Incomplete profile file write");
        offset += count;
    }
}
function parseSelectionPointer(content) {
    const errors = [];
    const tree = parseTree(content, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
    if (tree?.type !== "object" || errors.length > 0 || tree.children?.length !== 3)
        throw new DsmmProfileError("corrupt-selection", "The selected profile pointer must contain exactly three unique fields in valid JSON.");
    let input;
    try {
        input = JSON.parse(content);
    }
    catch {
        throw new DsmmProfileError("corrupt-selection", "The selected profile pointer is not valid JSON.");
    }
    if (typeof input !== "object" || input === null || Array.isArray(input))
        throw new DsmmProfileError("corrupt-selection", "The selected profile pointer must be a versioned object.");
    const record = input;
    if (Object.keys(record).length !== 3 || !["version", "id", "revision"].every((key) => Object.hasOwn(record, key)) || record.version !== 1)
        throw new DsmmProfileError("corrupt-selection", "The selected profile pointer has an unsupported shape or version.");
    if (record.id === null && record.revision === null)
        return { version: 1, id: null, revision: null };
    validateProfileId(record.id);
    validateProfileRevision(record.revision, "revision");
    return { version: 1, id: record.id, revision: record.revision };
}
export function validateSessionProfileId(id) {
    if (typeof id !== "string" || id.length < 1 || id.length > 256 || /[\u0000-\u001f\u007f]/u.test(id) || Buffer.from(id, "utf8").toString("utf8") !== id) {
        throw new DsmmProfileError("validation", "A bounded native session ID is required.", "sessionId");
    }
}
function sessionChoiceKey(sessionId) { return digest(Buffer.from(sessionId, "utf8")); }
function validateSelectionRequest(request) {
    if (request.id !== null) {
        validateProfileId(request.id);
        validateProfileRevision(request.expectedRevision);
    }
    else if (request.expectedRevision !== undefined) {
        throw new DsmmProfileError("validation", "Baseline selection must not include a draft revision.", "expectedRevision");
    }
    if (request.expectedSelectionRevision !== ABSENT_PROFILE_SELECTION_REVISION)
        validateProfileRevision(request.expectedSelectionRevision, "expectedSelectionRevision");
}
function parseSessionSelectionPointer(content, sessionId) {
    const errors = [];
    const tree = parseTree(content, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
    if (tree?.type !== "object" || errors.length > 0 || tree.children?.length !== 5)
        throw new DsmmProfileError("corrupt-selection", "The session choice must contain exactly five unique fields in valid JSON.");
    const record = JSON.parse(content);
    if (Object.keys(record).length !== 5 || !["version", "sessionId", "id", "revision", "epoch"].every((key) => Object.hasOwn(record, key)) || record.version !== 1 || record.sessionId !== sessionId) {
        throw new DsmmProfileError("corrupt-selection", "The session choice identity, shape or version is invalid.");
    }
    validateProfileRevision(record.epoch, "admissionEpoch");
    const selection = parseSelectionPointer(JSON.stringify({ version: record.version, id: record.id, revision: record.revision }));
    return { ...selection, sessionId, epoch: record.epoch };
}
function conflict(message) {
    throw new DsmmProfileError("conflict", message);
}
function safeInventoryId(id) {
    return /^[a-zA-Z0-9_-]{1,64}$/u.test(id) ? id : "invalid-profile";
}
//# sourceMappingURL=profile-store.js.map