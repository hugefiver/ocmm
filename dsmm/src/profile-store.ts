import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, renameSync, unlinkSync, writeSync } from "node:fs";
import type { Stats } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";
import { parseTree } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";
import { ABSENT_PROFILE_SELECTION_REVISION } from "./profile-types.js";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSelectionState, ProfileSnapshot, ProfileSummary, SessionProfileSelectRequest } from "./profile-types.js";
import { DsmmProfileError, MAX_PROFILE_BYTES, MAX_PROFILE_COUNT, MAX_PROFILE_DIRECTORY_ENTRIES, MAX_PROFILE_REVISIONS, parseProfileDocument, profileErrorInfo, validateProfileId, validateProfileRevision } from "./profiles.js";
import type { DsmmProfileDocument } from "./profiles.js";

export type SaveProfileRequest = ProfileSaveRequest;
export type SelectProfileRequest = ProfileSelectRequest;

export interface LoadedProfileSelection extends ProfileSelectionState {
  document: DsmmProfileDocument | null;
  content: string | null;
}

export interface LoadedSessionProfileSelection extends LoadedProfileSelection {
  sessionId: string;
  admissionEpoch: string | null;
}

export const MAX_SESSION_PROFILE_CHOICES = 1024;

export interface SessionProfileCommit<T> {
  /** Trusted native liveness/cancellation fence; invoked immediately before rename. */
  assertCurrent(): void;
  /** Synchronous publication after durable commit. Must not throw or await. */
  committed(selection: LoadedSessionProfileSelection, prepared: T): void;
}

export interface ProfileStoreOptions {
  lockTimeoutMs?: number;
  lockPollMs?: number;
  /** Narrow test seam for a failed atomic replacement; never delete the old target. */
  rename?: (source: string, destination: string) => void;
}

interface ProfileFile {
  bytes: Buffer;
  content: string;
  revision: string;
}

interface ProfileDraft extends ProfileFile {
  document: DsmmProfileDocument;
}

interface SelectionPointer {
  version: 1;
  id: string | null;
  revision: string | null;
}

interface SessionSelectionPointer extends SelectionPointer {
  sessionId: string;
  epoch: string;
}

/** This directory is supplied by the Host, never by a remote method parameter. */
export class ProfileStore {
  readonly profileDir: string;
  private readonly timeoutMs: number;
  private readonly pollMs: number;
  private readonly rename: (source: string, destination: string) => void;
  private rootIdentity?: Stats;

  constructor(profileDir: string, options: ProfileStoreOptions = {}) {
    if (!isAbsolute(profileDir) || dirname(resolve(profileDir)) === resolve(profileDir) || basename(resolve(profileDir)) !== "dsmm-profiles") {
      throw new DsmmProfileError("unsafe-path", "The Host must supply its native profile's dsmm-profiles directory.");
    }
    this.profileDir = resolve(profileDir);
    this.timeoutMs = boundedOption(options.lockTimeoutMs, 2000, 0, 30000);
    this.pollMs = boundedOption(options.lockPollMs, 25, 1, 1000);
    this.rename = options.rename ?? renameSync;
  }

  async describe(): Promise<ProfileSnapshot> {
    return this.locked(() => {
      const entries = this.inventory();
      const profiles: ProfileSummary[] = entries.map((name) => {
        const id = name.slice(0, -6);
        try {
          validateProfileId(id);
          if (name !== `${id}.jsonc`) throw new DsmmProfileError("unsafe-path", "Profile filename must use lowercase .jsonc and match its ID.");
          const draft = this.draft(id, entries);
          return { id, ...(draft.document.label === undefined ? {} : { label: draft.document.label }), revision: draft.revision };
        } catch (error) {
          return { id: safeInventoryId(id), revision: null, error: profileErrorInfo(error) };
        }
      });
      try {
        const selected = this.selection();
        return { profiles, selectedId: selected.selectedId, appliedRevision: selected.appliedRevision, selectionRevision: selected.selectionRevision };
      } catch (error) {
        // An error is not a successful fallback to the baseline.
        return { profiles, selectedId: null, appliedRevision: null, selectionRevision: "unavailable", selectionError: profileErrorInfo(error, "corrupt-selection") };
      }
    });
  }

  async read(id: string): Promise<ProfileReadResult> {
    validateProfileId(id);
    return this.locked(() => this.readResult(this.draft(id, this.inventory())));
  }

  async save(request: ProfileSaveRequest): Promise<ProfileReadResult> {
    validateProfileId(request.id);
    const document = parseProfileDocument(request.content, request.id);
    if (request.expectedRevision !== null) validateProfileRevision(request.expectedRevision);
    return this.locked((assertLock) => {
      const entries = this.inventory();
      const name = this.draftName(request.id, entries);
      const current = name === undefined ? undefined : this.draft(request.id, entries);
      if ((current?.revision ?? null) !== request.expectedRevision) conflict("The profile changed since it was opened. Reload it before saving.");
      if (current === undefined && entries.length >= MAX_PROFILE_COUNT) throw new DsmmProfileError("limit", "At most 128 Deepwork profiles are supported.");
      const bytes = Buffer.from(request.content, "utf8");
      const target = join(this.profileDir, `${request.id}.jsonc`);
      this.atomicReplace(target, bytes, () => {
        const latestNames = this.inventory();
        const latest = this.draftName(request.id, latestNames) === undefined ? null : this.draft(request.id, latestNames).revision;
        if (latest !== request.expectedRevision) conflict("The profile was edited externally during save. Reload it before saving.");
      }, assertLock);
      return this.readResult({ bytes, content: request.content, revision: digest(bytes), document });
    });
  }

  async loadSelection(): Promise<LoadedProfileSelection> {
    return this.locked(() => this.selection());
  }

  async loadSessionSelection(sessionId: string): Promise<LoadedSessionProfileSelection> {
    validateSessionProfileId(sessionId);
    return this.locked(() => this.sessionSelection(sessionId));
  }

  async selectSession<T>(request: SessionProfileSelectRequest, epoch: string,
    validateCandidate: (document: DsmmProfileDocument | null) => T | Promise<T>,
    commit: SessionProfileCommit<T>): Promise<{ selection: LoadedSessionProfileSelection; prepared: T }> {
    validateSessionProfileId(request.sessionId);
    validateSelectionRequest(request);
    validateProfileRevision(epoch, "admissionEpoch");
    return this.locked(async (assertLock) => {
      commit.assertCurrent();
      if (this.sessionSelection(request.sessionId).selectionRevision !== request.expectedSelectionRevision) conflict("The session profile changed. Refresh before selecting again.");
      const draft = request.id === null ? undefined : this.draft(request.id, this.inventory());
      if (draft !== undefined && draft.revision !== request.expectedRevision) conflict("The profile changed before selection. Reload and select its latest revision.");
      let prepared: T;
      try { prepared = await validateCandidate(draft === undefined ? null : structuredClone(draft.document)); }
      catch (error) {
        if (error instanceof DsmmProfileError) throw error;
        throw new DsmmProfileError("activation", "The candidate profile could not be activated; the previous session selection was retained.");
      }
      const directory = join(this.profileDir, ".sessions");
      const target = join(directory, `${sessionChoiceKey(request.sessionId)}.json`);
      const fence = (temporary?: string): void => {
        commit.assertCurrent();
        if (this.sessionSelection(request.sessionId, temporary).selectionRevision !== request.expectedSelectionRevision) conflict("The session selection was edited externally. Refresh before selecting again.");
        if (draft !== undefined && this.draft(request.id!, this.inventory()).revision !== draft.revision) conflict("The draft changed during activation. Reload and select again.");
        validateDirectories(directory, false);
        // The one exclusive atomic staging file is not a session choice.
        const entries = boundedEntries(directory, MAX_SESSION_PROFILE_CHOICES + (temporary === undefined ? 0 : 1))
          .filter((name) => temporary === undefined || name !== basename(temporary));
        if (status(target) === undefined && entries.length >= MAX_SESSION_PROFILE_CHOICES) throw new DsmmProfileError("limit", "The session profile choice inventory is full; no selection was committed.");
      };
      assertLock();
      commit.assertCurrent();
      validateDirectories(directory, true);
      fence();
      if (draft !== undefined) this.publishRevision(draft, assertLock);
      const pointer: SessionSelectionPointer = { version: 1, sessionId: request.sessionId, id: request.id, revision: draft?.revision ?? null, epoch };
      const bytes = Buffer.from(`${JSON.stringify(pointer)}\n`, "utf8");
      const selection: LoadedSessionProfileSelection = { sessionId: request.sessionId, admissionEpoch: epoch,
        selectedId: request.id, appliedRevision: draft?.revision ?? null, selectionRevision: digest(bytes), document: draft?.document ?? null, content: draft?.content ?? null };
      this.atomicReplace(target, bytes, fence, assertLock);
      commit.committed(selection, prepared);
      return { selection, prepared };
    });
  }

  async select<T = undefined>(request: ProfileSelectRequest, validateCandidate?: (document: DsmmProfileDocument | null) => T | Promise<T>): Promise<{ selection: LoadedProfileSelection; prepared: T }> {
    validateSelectionRequest(request);
    return this.locked(async (assertLock) => {
      const current = this.selection();
      if (current.selectionRevision !== request.expectedSelectionRevision) conflict("The selected profile changed. Refresh before selecting again.");
      const draft = request.id === null ? undefined : this.draft(request.id, this.inventory());
      if (draft !== undefined && draft.revision !== request.expectedRevision) conflict("The profile changed before selection. Reload and select its latest revision.");
      let prepared: T;
      try {
        prepared = await validateCandidate?.(draft === undefined ? null : structuredClone(draft.document)) as T;
      } catch (error) {
        if (error instanceof DsmmProfileError) throw error;
        throw new DsmmProfileError("activation", "The candidate profile could not be activated; the previous selection was retained.");
      }
      // The audit may await native work. Recheck security and CAS afterwards.
      assertLock();
      this.assertSelectionRevision(request.expectedSelectionRevision);
      if (draft !== undefined && this.draft(request.id!, this.inventory()).revision !== draft.revision) conflict("The draft changed during activation. Reload and select again.");
      if (draft !== undefined) this.publishRevision(draft, assertLock);
      const pointer: SelectionPointer = { version: 1, id: request.id, revision: draft?.revision ?? null };
      const bytes = Buffer.from(`${JSON.stringify(pointer)}\n`, "utf8");
      this.atomicReplace(join(this.profileDir, ".selection.json"), bytes, () => {
        this.assertSelectionRevision(request.expectedSelectionRevision);
        if (draft !== undefined && this.draft(request.id!, this.inventory()).revision !== draft.revision) conflict("The draft changed during selection. Reload and select again.");
      }, assertLock);
      return {
        selection: { selectedId: request.id, appliedRevision: draft?.revision ?? null, selectionRevision: digest(bytes), document: draft?.document ?? null, content: draft?.content ?? null },
        prepared
      };
    });
  }

  private readResult(draft: ProfileDraft): ProfileReadResult {
    return { id: draft.document.id, ...(draft.document.label === undefined ? {} : { label: draft.document.label }), revision: draft.revision, content: draft.content };
  }

  private inventory(): string[] {
    this.validateRoot(false);
    const names = boundedEntries(this.profileDir, MAX_PROFILE_DIRECTORY_ENTRIES).filter((name) => !name.startsWith(".") && /\.jsonc$/iu.test(name)).sort();
    if (names.length > MAX_PROFILE_COUNT) throw new DsmmProfileError("limit", "Profile inventory exceeds the 128-profile limit.");
    const seen = new Set<string>();
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) throw new DsmmProfileError("unsafe-path", "Profile filenames collide case-insensitively; rename the conflicting files manually.");
      seen.add(key);
    }
    return names;
  }

  private draftName(id: string, entries: string[]): string | undefined {
    const expected = `${id}.jsonc`;
    const found = entries.find((name) => name.toLowerCase() === expected);
    if (found !== undefined && found !== expected) throw new DsmmProfileError("unsafe-path", "An existing profile has a conflicting filename case; rename it manually.");
    return found;
  }

  private draft(id: string, entries: string[]): ProfileDraft {
    validateProfileId(id);
    const name = this.draftName(id, entries);
    if (name === undefined) throw new DsmmProfileError("not-found", "The requested Deepwork profile does not exist.");
    const file = regularFile(join(this.profileDir, name), MAX_PROFILE_BYTES);
    return { ...file, document: parseProfileDocument(file.content, id) };
  }

  private selection(): LoadedProfileSelection {
    this.validateRoot(false);
    const path = join(this.profileDir, ".selection.json");
    if (status(path) === undefined) return { selectedId: null, appliedRevision: null, selectionRevision: ABSENT_PROFILE_SELECTION_REVISION, document: null, content: null };
    try {
      const file = regularFile(path, 1024);
      const pointer = parseSelectionPointer(file.content);
      if (pointer.id === null) return { selectedId: null, appliedRevision: null, selectionRevision: file.revision, document: null, content: null };
      validateDirectories(join(this.profileDir, ".revisions"), false);
      const immutable = regularFile(join(this.profileDir, ".revisions", `${pointer.revision}.jsonc`), MAX_PROFILE_BYTES);
      if (immutable.revision !== pointer.revision) throw new DsmmProfileError("corrupt-selection", "The selected immutable profile revision failed its SHA256 verification.");
      const document = parseProfileDocument(immutable.content, pointer.id);
      return { selectedId: pointer.id, appliedRevision: pointer.revision, selectionRevision: file.revision, document, content: immutable.content };
    } catch (error) {
      if (error instanceof DsmmProfileError && error.code === "unsafe-path") throw error;
      throw new DsmmProfileError("corrupt-selection", "The selected profile pointer or immutable revision is missing or invalid. Repair it explicitly; the baseline was not silently selected.");
    }
  }

  private sessionSelection(sessionId: string, temporary?: string): LoadedSessionProfileSelection {
    this.validateRoot(false);
    const absent: LoadedSessionProfileSelection = { sessionId, admissionEpoch: null, selectedId: null, appliedRevision: null,
      selectionRevision: ABSENT_PROFILE_SELECTION_REVISION, document: null, content: null };
    const directory = join(this.profileDir, ".sessions");
    if (status(directory) === undefined) return absent;
    validateDirectories(directory, false);
    const entries = boundedEntries(directory, MAX_SESSION_PROFILE_CHOICES + (temporary === undefined ? 0 : 1))
      .filter((name) => temporary === undefined || name !== basename(temporary));
    if (entries.length > MAX_SESSION_PROFILE_CHOICES) throw new DsmmProfileError("limit", "The session profile choice inventory exceeds its supported limit.");
    const path = join(directory, `${sessionChoiceKey(sessionId)}.json`);
    if (status(path) === undefined) return absent;
    try {
      const file = regularFile(path, 2048);
      const pointer = parseSessionSelectionPointer(file.content, sessionId);
      if (pointer.id === null) return { ...absent, admissionEpoch: pointer.epoch, selectionRevision: file.revision };
      validateDirectories(join(this.profileDir, ".revisions"), false);
      const immutable = regularFile(join(this.profileDir, ".revisions", `${pointer.revision}.jsonc`), MAX_PROFILE_BYTES);
      if (immutable.revision !== pointer.revision) throw new DsmmProfileError("corrupt-selection", "The session's immutable profile revision failed SHA256 verification.");
      return { sessionId, admissionEpoch: pointer.epoch, selectedId: pointer.id, appliedRevision: pointer.revision,
        selectionRevision: file.revision, document: parseProfileDocument(immutable.content, pointer.id), content: immutable.content };
    } catch (error) {
      if (error instanceof DsmmProfileError && error.code === "unsafe-path") throw error;
      throw new DsmmProfileError("corrupt-selection", "The session profile choice or immutable revision is missing or invalid. Repair it explicitly; no global or baseline fallback was admitted.");
    }
  }

  private assertSelectionRevision(expected: string): void {
    if (this.selection().selectionRevision !== expected) conflict("The selection was edited externally. Refresh before selecting again.");
  }

  private publishRevision(draft: ProfileDraft, assertLock: () => void): void {
    assertLock();
    const directory = join(this.profileDir, ".revisions");
    validateDirectories(directory, true);
    const path = join(directory, `${draft.revision}.jsonc`);
    if (status(path) !== undefined) {
      const existing = regularFile(path, MAX_PROFILE_BYTES);
      if (existing.revision !== draft.revision || !existing.bytes.equals(draft.bytes)) throw new DsmmProfileError("corrupt-selection", "An immutable profile revision has been altered; no selection was committed.");
      return;
    }
    if (boundedEntries(directory, MAX_PROFILE_REVISIONS).length >= MAX_PROFILE_REVISIONS) throw new DsmmProfileError("limit", "The immutable revision inventory is full; no selection was committed.");
    let fd: number | undefined;
    let created = false;
    try {
      assertLock();
      fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      created = true;
      writeAll(fd, draft.bytes);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      if (created) unlinkSync(path);
      throw error;
    }
  }

  private atomicReplace(target: string, bytes: Buffer, beforeRename: (temporary: string) => void, assertLock: () => void): void {
    assertLock();
    if (status(target) !== undefined) assertRegular(status(target)!);
    const temporary = join(dirname(target), `.dsmm-tmp-${randomUUID()}`);
    let fd: number | undefined;
    let created = false;
    try {
      fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      created = true;
      writeAll(fd, bytes);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      this.validateRoot(false);
      if (status(target) !== undefined) assertRegular(status(target)!);
      beforeRename(temporary);
      assertLock();
      this.rename(temporary, target);
      created = false;
      // rename is the transaction commit. No fallible work follows it.
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (created) {
        try { unlinkSync(temporary); } catch { /* Never remove another or previous file to recover a failed commit. */ }
      }
    }
  }

  private validateRoot(create: boolean): void {
    validateDirectories(this.profileDir, create);
    const current = lstatSync(this.profileDir);
    if (this.rootIdentity !== undefined && !sameFile(this.rootIdentity, current)) {
      throw new DsmmProfileError("unsafe-path", "The profile storage directory was replaced during this Host's lifetime; no operation was committed.");
    }
    this.rootIdentity ??= current;
  }

  private async locked<T>(operation: (assertLock: () => void) => T | Promise<T>): Promise<T> {
    let fd: number | undefined;
    let ownedStatus: Stats | undefined;
    let ownedBytes: Buffer | undefined;
    const lockPath = join(this.profileDir, ".lock");
    const assertLock = (): void => {
      this.validateRoot(false);
      const current = status(lockPath);
      if (fd === undefined || ownedStatus === undefined || ownedBytes === undefined || current === undefined || !sameFile(ownedStatus, current) || !sameFile(ownedStatus, fstatSync(fd))) {
        conflict("Profile lock ownership changed during this operation. No selection was committed; retry after the current owner finishes.");
      }
      assertRegular(current);
      assertRegular(fstatSync(fd));
      if (!regularFile(lockPath, 256).bytes.equals(ownedBytes)) conflict("The profile lock was altered during this operation. No selection was committed; retry after the current owner finishes.");
    };
    try {
      this.validateRoot(true);
      const deadline = performance.now() + this.timeoutMs;
      for (;;) {
        this.validateRoot(false);
        try {
          fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
          ownedStatus = fstatSync(fd);
          ownedBytes = Buffer.from(`${process.pid} ${randomUUID()}\n`, "utf8");
          writeAll(fd, ownedBytes);
          fsyncSync(fd);
          break;
        } catch (error) {
          if (fd !== undefined || errorCode(error) !== "EEXIST") throw error;
          const existing = status(lockPath);
          if (existing !== undefined) assertRegular(existing);
          if (performance.now() >= deadline) throw new DsmmProfileError("lock-timeout", "Another process owns the profile lock. Retry after it finishes; locks are never stolen.");
          await new Promise<void>((done) => setTimeout(done, Math.min(this.pollMs, Math.max(1, deadline - performance.now()))));
        }
      }
      assertLock();
      return await operation(assertLock);
    } catch (error) {
      if (error instanceof DsmmProfileError) throw error;
      throw new DsmmProfileError("io", "Deepwork profile storage failed. Existing files and the previous selection were retained.");
    } finally {
      if (fd !== undefined) {
        try { closeSync(fd); } catch { /* A committed pointer must remain a successful transaction. */ }
        try {
          this.validateRoot(false);
          const current = status(lockPath);
          if (ownedStatus !== undefined && ownedBytes !== undefined && current !== undefined && sameFile(ownedStatus, current) && current.isFile() && !current.isSymbolicLink() && regularFile(lockPath, 256).bytes.equals(ownedBytes)) unlinkSync(lockPath);
        } catch { /* Do not delete a replacement lock or traverse an altered root. */ }
      }
    }
  }
}

function boundedOption(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new DsmmProfileError("validation", "Profile lock timing is outside supported bounds.");
  return value;
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function status(path: string): Stats | undefined {
  try { return lstatSync(path); } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

function validateDirectories(directory: string, create: boolean): void {
  const absolute = resolve(directory);
  const root = parse(absolute).root;
  const parts: string[] = [];
  for (let current = absolute; current !== root; current = dirname(current)) parts.unshift(current);
  parts.unshift(root);
  for (const path of parts) {
    let found = status(path);
    if (found === undefined && create) {
      try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (errorCode(error) !== "EEXIST") throw error; }
      found = status(path);
    }
    if (found === undefined || found.isSymbolicLink() || !found.isDirectory()) throw new DsmmProfileError("unsafe-path", "Profile directories and every ancestor must be real directories, not links or junctions.");
    const canonical = resolve(realpathSync(path));
    if ((process.platform === "win32" ? canonical.toLowerCase() : canonical) !== (process.platform === "win32" ? path.toLowerCase() : path)) {
      throw new DsmmProfileError("unsafe-path", "Profile storage must not traverse redirected directories or reparse points.");
    }
  }
}

function assertRegular(found: Stats): void {
  if (found.isSymbolicLink() || !found.isFile() || found.nlink !== 1) throw new DsmmProfileError("unsafe-path", "Profile files and lock files must be regular, unlinked files, not symlinks, junctions, directories or hard links.");
}

function sameFile(first: Stats, second: Stats): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

function regularFile(path: string, maximum: number): ProfileFile {
  const before = status(path);
  if (before === undefined) throw new DsmmProfileError("not-found", "The required profile file does not exist.");
  assertRegular(before);
  if (before.size > maximum) throw new DsmmProfileError("limit", "Profile storage contains an oversized file.");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    assertRegular(opened);
    if (!sameFile(before, opened)) conflict("The profile file changed while it was opened. Retry the operation.");
    const buffer = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, size);
      if (count === 0) break;
      size += count;
    }
    if (size > maximum) throw new DsmmProfileError("limit", "Profile storage contains an oversized file.");
    const after = fstatSync(fd);
    const named = status(path);
    if (named === undefined || !sameFile(opened, named) || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || opened.ctimeMs !== after.ctimeMs) conflict("The profile file was edited while being read. Retry the operation.");
    const bytes = buffer.subarray(0, size);
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new DsmmProfileError("validation", "Profile files must contain valid UTF-8 text.", "content"); }
    return { bytes, content, revision: digest(bytes) };
  } finally { closeSync(fd); }
}

function boundedEntries(directory: string, maximum: number): string[] {
  const handle = opendirSync(directory);
  const entries: string[] = [];
  try {
    for (;;) {
      const entry = handle.readSync();
      if (entry === null) break;
      if (entries.length >= maximum) throw new DsmmProfileError("limit", "Profile storage inventory exceeds its supported limit.");
      entries.push(entry.name);
    }
  } finally { handle.closeSync(); }
  return entries;
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (count === 0) throw new Error("Incomplete profile file write");
    offset += count;
  }
}

function parseSelectionPointer(content: string): SelectionPointer {
  const errors: ParseError[] = [];
  const tree = parseTree(content, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (tree?.type !== "object" || errors.length > 0 || tree.children?.length !== 3) throw new DsmmProfileError("corrupt-selection", "The selected profile pointer must contain exactly three unique fields in valid JSON.");
  let input: unknown;
  try { input = JSON.parse(content) as unknown; } catch { throw new DsmmProfileError("corrupt-selection", "The selected profile pointer is not valid JSON."); }
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new DsmmProfileError("corrupt-selection", "The selected profile pointer must be a versioned object.");
  const record = input as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !["version", "id", "revision"].every((key) => Object.hasOwn(record, key)) || record.version !== 1) throw new DsmmProfileError("corrupt-selection", "The selected profile pointer has an unsupported shape or version.");
  if (record.id === null && record.revision === null) return { version: 1, id: null, revision: null };
  validateProfileId(record.id);
  validateProfileRevision(record.revision, "revision");
  return { version: 1, id: record.id, revision: record.revision };
}

export function validateSessionProfileId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.length < 1 || id.length > 256 || /[\u0000-\u001f\u007f]/u.test(id) || Buffer.from(id, "utf8").toString("utf8") !== id) {
    throw new DsmmProfileError("validation", "A bounded native session ID is required.", "sessionId");
  }
}

function sessionChoiceKey(sessionId: string): string { return digest(Buffer.from(sessionId, "utf8")); }

function validateSelectionRequest(request: ProfileSelectRequest): void {
  if (request.id !== null) {
    validateProfileId(request.id);
    validateProfileRevision(request.expectedRevision);
  } else if (request.expectedRevision !== undefined) {
    throw new DsmmProfileError("validation", "Baseline selection must not include a draft revision.", "expectedRevision");
  }
  if (request.expectedSelectionRevision !== ABSENT_PROFILE_SELECTION_REVISION) validateProfileRevision(request.expectedSelectionRevision, "expectedSelectionRevision");
}

function parseSessionSelectionPointer(content: string, sessionId: string): SessionSelectionPointer {
  const errors: ParseError[] = [];
  const tree = parseTree(content, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (tree?.type !== "object" || errors.length > 0 || tree.children?.length !== 5) throw new DsmmProfileError("corrupt-selection", "The session choice must contain exactly five unique fields in valid JSON.");
  const record = JSON.parse(content) as Record<string, unknown>;
  if (Object.keys(record).length !== 5 || !["version", "sessionId", "id", "revision", "epoch"].every((key) => Object.hasOwn(record, key)) || record.version !== 1 || record.sessionId !== sessionId) {
    throw new DsmmProfileError("corrupt-selection", "The session choice identity, shape or version is invalid.");
  }
  validateProfileRevision(record.epoch, "admissionEpoch");
  const selection = parseSelectionPointer(JSON.stringify({ version: record.version, id: record.id, revision: record.revision }));
  return { ...selection, sessionId, epoch: record.epoch };
}

function conflict(message: string): never {
  throw new DsmmProfileError("conflict", message);
}

function safeInventoryId(id: string): string {
  return /^[a-zA-Z0-9_-]{1,64}$/u.test(id) ? id : "invalid-profile";
}
