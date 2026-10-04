import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath, rename } from "node:fs/promises";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { KNOWN_SESSION_EVENT_TYPES, SESSION_FORMAT_VERSION } from "@deepseek-ai/dsh-session";
import { annotateDsmmEvent } from "../lib/session-metadata.js";

const MAX_BYTES = 256 * 1024 * 1024;
const MARKER = Buffer.from(',"ignorable":true');
const ZSTD_MAGIC = 0xfd2fb528;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const checksumOptions = { params: { [constants.ZSTD_c_checksumFlag]: 1 } };
const sha256 = value => createHash("sha256").update(value).digest("hex");

/** Safe diagnostics deliberately omit parser, native, filesystem, and record payloads. */
export class SessionLogRepairError extends Error {
  constructor(code, recovery = {}) {
    super(`Session-log repair refused: ${code}`);
    this.name = "SessionLogRepairError";
    this.code = code;
    this.recovery = Object.freeze({ ...recovery });
  }
}

const refuse = code => { throw new SessionLogRepairError(code); };
const safeFailure = (error, code) => error instanceof SessionLogRepairError ? error : new SessionLogRepairError(code);
const safeInteger = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);

/** Spec-only frame boundaries; decoding and checksum validation use public node:zlib. */
export function scanZstdFrames(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) refuse("INVALID_INPUT");
  const frames = [];
  let cursor = 0;
  const requireBytes = count => {
    if (count > bytes.length - cursor) refuse("TORN_FRAME");
  };
  while (cursor < bytes.length) {
    const start = cursor;
    requireBytes(5);
    if (bytes.readUInt32LE(cursor) !== ZSTD_MAGIC) refuse("CORRUPT_FRAME");
    const descriptor = bytes[cursor + 4];
    cursor += 5;
    if ((descriptor & 0x18) !== 0) refuse("CORRUPT_FRAME");
    if ((descriptor & 0x04) === 0) refuse("UNCHECKSUMMED_FRAME");
    const singleSegment = (descriptor & 0x20) !== 0;
    const dictionaryFlag = descriptor & 0x03;
    const contentFlag = descriptor >>> 6;
    const dictionarySize = [0, 1, 2, 4][dictionaryFlag];
    const contentSize = contentFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][contentFlag];
    requireBytes((singleSegment ? 0 : 1) + dictionarySize + contentSize);
    cursor += (singleSegment ? 0 : 1) + dictionarySize + contentSize;
    let last = false;
    while (!last) {
      requireBytes(3);
      const block = bytes.readUIntLE(cursor, 3);
      cursor += 3;
      last = (block & 1) !== 0;
      const kind = (block >>> 1) & 3;
      const size = block >>> 3;
      if (kind === 3 || size > 128 * 1024) refuse("CORRUPT_FRAME");
      const physicalSize = kind === 1 ? 1 : size;
      requireBytes(physicalSize);
      cursor += physicalSize;
    }
    requireBytes(4);
    cursor += 4;
    frames.push({ start, end: cursor });
  }
  return frames;
}

function parseRow(bytes) {
  let text;
  let value;
  try {
    text = decoder.decode(bytes);
    value = JSON.parse(text);
  } catch {
    refuse("INVALID_JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) refuse("INVALID_RECORD");
  // JSON.parse alone would erase duplicate keys. Tokenize already-valid JSON to refuse them.
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/gu;
  const stack = [];
  for (const match of text.matchAll(tokens)) {
    const token = match[0];
    const top = stack.at(-1);
    if (token === "{") stack.push({ keys: new Set(), keyExpected: true });
    else if (token === "[") stack.push({});
    else if (token === "}" || token === "]") stack.pop();
    else if (token === "," && top?.keys) top.keyExpected = true;
    else if (token.startsWith('"') && top?.keys && top.keyExpected) {
      const key = JSON.parse(token);
      if (top.keys.has(key)) refuse("INVALID_JSON");
      top.keys.add(key);
      top.keyExpected = false;
    }
  }
  const pending = [value];
  while (pending.length) {
    const entry = pending.pop();
    if (typeof entry === "string" && !entry.isWellFormed()) refuse("INVALID_JSON");
    if (typeof entry === "number" && (!Number.isFinite(entry) || Object.is(entry, -0))) refuse("INVALID_JSON");
    if (typeof entry === "object" && entry !== null) {
      for (const [key, child] of Object.entries(entry)) {
        if (!key.isWellFormed()) refuse("INVALID_JSON");
        pending.push(child);
      }
    }
  }
  return value;
}

function readRows(plaintext) {
  const rows = [];
  let offset = 0;
  while (offset < plaintext.length) {
    const end = plaintext.indexOf(10, offset);
    if (end < 0) refuse("TORN_RECORD");
    rows.push({ value: parseRow(plaintext.subarray(offset, end)), start: offset, end });
    offset = end + 1;
  }
  if (rows.length === 0) refuse("INVALID_RECORD");
  return rows;
}

/** Returned rows/bytes are private in-memory verification inputs, never console output. */
export function auditSessionLog(bytes, { encoding = "zstd", maxBytes = MAX_BYTES } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || !safeInteger(maxBytes) || maxBytes < 1 || bytes.length > maxBytes) refuse("INPUT_LIMIT");
  if (encoding !== "zstd" && encoding !== "none") refuse("INVALID_ENCODING");
  const frames = encoding === "zstd" ? scanZstdFrames(bytes) : [{ start: 0, end: bytes.length }];
  const decoded = [];
  let decodedSize = 0;
  for (const frame of frames) {
    let plaintext;
    try {
      plaintext = encoding === "zstd" ? zstdDecompressSync(bytes.subarray(frame.start, frame.end), {
        maxOutputLength: maxBytes - decodedSize,
        params: { [constants.ZSTD_d_windowLogMax]: Math.max(10, Math.ceil(Math.log2(maxBytes))) }
      }) : bytes;
    } catch {
      refuse("CORRUPT_FRAME");
    }
    if (plaintext.length > maxBytes - decodedSize) refuse("INPUT_LIMIT");
    decoded.push({ ...frame, plaintext, plainStart: decodedSize, insertions: [] });
    decodedSize += plaintext.length;
  }
  const plaintext = Buffer.concat(decoded.map(frame => frame.plaintext));
  const sourceRows = readRows(plaintext);
  const header = sourceRows[0].value;
  if (header.type !== "session" || header.version !== SESSION_FORMAT_VERSION || typeof header.id !== "string" || !header.id
    || !safeInteger(header.createdAt) || typeof header.isSeeded !== "boolean" || !safeInteger(header.delegationDepth)) refuse("UNSUPPORTED_HEADER");
  const events = [];
  let changedEventCount = 0;
  for (let index = 1; index < sourceRows.length; index += 1) {
    const row = sourceRows[index];
    const event = row.value;
    if (typeof event.type !== "string" || !event.type || !safeInteger(event.seq) || event.seq !== index - 1 || !safeInteger(event.time)
      || !Object.hasOwn(event, "data") || Object.hasOwn(event, "ignorable") && event.ignorable !== true) refuse("INVALID_EVENT");
    let annotated;
    try {
      annotated = annotateDsmmEvent(event);
    } catch {
      refuse("INVALID_DSMM_METADATA");
    }
    if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && annotated.ignorable !== true) refuse("UNSUPPORTED_EVENT");
    events.push(annotated);
    if (annotated === event) continue;
    changedEventCount += 1;
    let insertion = row.end - 1;
    while (insertion >= row.start && [9, 13, 32].includes(plaintext[insertion])) insertion -= 1;
    if (plaintext[insertion] !== 125) refuse("INVALID_RECORD");
    const frame = decoded.find(part => insertion >= part.plainStart && insertion < part.plainStart + part.plaintext.length);
    if (!frame) refuse("INVALID_RECORD");
    frame.insertions.push(insertion - frame.plainStart);
  }
  let changedFrameCount = 0;
  const candidateFrames = decoded.map(frame => {
    if (frame.insertions.length === 0) return bytes.subarray(frame.start, frame.end);
    changedFrameCount += 1;
    const parts = [];
    let start = 0;
    for (const insertion of frame.insertions) {
      parts.push(frame.plaintext.subarray(start, insertion), MARKER);
      start = insertion;
    }
    parts.push(frame.plaintext.subarray(start));
    const value = Buffer.concat(parts);
    return encoding === "zstd" ? zstdCompressSync(value, checksumOptions) : value;
  });
  const candidateBytes = Buffer.concat(candidateFrames);
  // Independently decode candidate rows and prove complete structural equality except markers.
  const candidatePlaintext = encoding === "zstd"
    ? Buffer.concat(scanZstdFrames(candidateBytes).map(frame => zstdDecompressSync(candidateBytes.subarray(frame.start, frame.end), { maxOutputLength: maxBytes })))
    : candidateBytes;
  const rows = readRows(candidatePlaintext).map(row => row.value);
  if (!isDeepStrictEqual(rows, [header, ...events])) refuse("RECORD_EQUALITY_FAILED");
  return { header, rows, events, candidateBytes, encoding, changedEventCount, changedFrameCount,
    frameCount: frames.length, inputSha256: sha256(bytes), candidateSha256: sha256(candidateBytes) };
}

function validAbsolutePath(value) {
  if (typeof value !== "string" || !value.isWellFormed() || !isAbsolute(value) || /[\0*?]/u.test(value)) refuse("UNSAFE_PATH");
  const pieces = value.slice(parse(value).root.length).split(/[\\/]/u);
  if (pieces.some(piece => piece === "." || piece === ".." || process.platform === "win32" && (piece.includes(":") || /[. ]$/u.test(piece)))) refuse("UNSAFE_PATH");
  return resolve(value);
}

function within(root, path) {
  const difference = relative(root, path);
  return difference !== "" && !isAbsolute(difference) && difference !== ".." && !difference.startsWith(`..${sep}`);
}

async function assertPath(filePath, allowedRoot) {
  if (!within(allowedRoot, filePath)) refuse("UNSAFE_PATH");
  for (let current = filePath; ; current = dirname(current)) {
    const value = await lstat(current, { bigint: true });
    if (value.isSymbolicLink() || current !== filePath && !value.isDirectory()) refuse("UNSAFE_PATH");
    if (current === filePath && (!value.isFile() || value.nlink !== 1n)) refuse("UNSAFE_PATH");
    if (current === dirname(current)) break;
  }
  // Equality by relative path tolerates Windows casing/short names, but no redirected parent.
  const canonical = await realpath(filePath);
  const rootCanonical = await realpath(allowedRoot);
  if (!within(rootCanonical, canonical)) refuse("UNSAFE_PATH");
}

const revision = value => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");
const identity = value => [value.dev, value.ino].join(":");

async function snapshot(filePath, allowedRoot, maxBytes) {
  await assertPath(filePath, allowedRoot);
  const handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n) refuse("UNSAFE_PATH");
    if (before.size > BigInt(maxBytes)) refuse("INPUT_LIMIT");
    const chunks = [];
    let position = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - position + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      if (position > maxBytes) refuse("INPUT_LIMIT");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks);
    const after = await handle.stat({ bigint: true });
    const pathStat = await lstat(filePath, { bigint: true });
    if (revision(before) !== revision(after) || identity(after) !== identity(pathStat) || pathStat.nlink !== 1n || pathStat.isSymbolicLink()) refuse("SOURCE_CHANGED");
    return { bytes, sha256: sha256(bytes), revision: revision(after), identity: identity(after) };
  } finally {
    await handle.close();
  }
}

async function assertSnapshot(filePath, allowedRoot, maxBytes, expected, code) {
  const current = await snapshot(filePath, allowedRoot, maxBytes);
  if (current.sha256 !== expected.sha256 || current.revision !== expected.revision || current.identity !== expected.identity) refuse(code);
  return current;
}

async function createPrivateFile(filePath, bytes, allowedRoot, maxBytes) {
  // Recheck the existing parent immediately before exclusive artifact creation.
  const parent = dirname(filePath);
  if (parent !== allowedRoot && !within(allowedRoot, parent)) refuse("UNSAFE_PATH");
  for (let current = parent; ; current = dirname(current)) {
    const value = await lstat(current);
    if (!value.isDirectory() || value.isSymbolicLink()) refuse("UNSAFE_PATH");
    if (current === dirname(current)) break;
  }
  const canonicalParent = await realpath(parent);
  const canonicalRoot = await realpath(allowedRoot);
  if (relative(canonicalRoot, canonicalParent) !== "" && !within(canonicalRoot, canonicalParent)) refuse("UNSAFE_PATH");
  const handle = await open(filePath, "wx", 0o600);
  try {
    if (process.platform !== "win32") await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const created = await snapshot(filePath, allowedRoot, maxBytes);
  if (created.sha256 !== sha256(bytes)) refuse("ARTIFACT_VERIFY_FAILED");
  if (process.platform !== "win32" && ((await lstat(filePath)).mode & 0o777) !== 0o600) refuse("PRIVATE_ARTIFACT_REQUIRED");
  await syncDirectory(dirname(filePath));
  return created;
}

async function syncDirectory(directory) {
  if (process.platform === "win32") return; // Windows replacement has no unlink fallback.
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function assertLease(lease) {
  try {
    if (!lease || typeof lease.release !== "function" || typeof lease.assertQuiescent !== "function"
      || typeof lease.assertPrivateDirectory !== "function" || await lease.assertQuiescent() !== true
      || await lease.assertPrivateDirectory() !== true) refuse("QUIESCENCE_REQUIRED");
  } catch (error) {
    throw safeFailure(error, "QUIESCENCE_REQUIRED");
  }
}

async function verifyNative(verifyCandidate, candidatePath, sourcePath, originalPath, audit, expectedSha256) {
  try {
    const result = await verifyCandidate({ candidatePath, sourcePath, originalPath, header: structuredClone(audit.header),
      rows: structuredClone(audit.rows), events: structuredClone(audit.events), encoding: audit.encoding,
      expectedSha256, candidateSha256: audit.candidateSha256 });
    if (result?.publicRead !== true || result?.restored !== true || result?.historyEqual !== true) refuse("NATIVE_VERIFY_FAILED");
  } catch {
    refuse("NATIVE_VERIFY_FAILED");
  }
}

function receipt(audit, outcome, recovery = {}) {
  return Object.freeze({ outcome, originalSha256: audit.inputSha256, candidateSha256: audit.candidateSha256,
    changedEventCount: audit.changedEventCount, changedFrameCount: audit.changedFrameCount,
    frameCount: audit.frameCount, eventCount: audit.events.length, encoding: audit.encoding, ...recovery });
}

/**
 * Apply requires trusted, actually held native writer exclusion, carrier-quiescence,
 * same-directory privacy, and public native read/restore/history verification.
 * Those callbacks are operator integration, not model-controlled boolean claims.
 */
export async function repairSessionLog({ filePath: suppliedPath, allowedRoot: suppliedRoot, expectedSha256,
  apply = false, acquireExclusiveWriterLease, verifyCandidate, maxBytes = MAX_BYTES } = {}) {
  let lease;
  let result;
  let failure;
  const recovery = {};
  try {
    const filePath = validAbsolutePath(suppliedPath);
    const allowedRoot = validAbsolutePath(suppliedRoot);
    if (!/^[a-f0-9]{64}$/u.test(expectedSha256 ?? "")) refuse("EXPECTED_DIGEST_REQUIRED");
    if (apply !== true && apply !== false || !safeInteger(maxBytes) || maxBytes < 1) refuse("INVALID_OPTIONS");
    if (apply && (typeof acquireExclusiveWriterLease !== "function" || typeof verifyCandidate !== "function")) refuse("VERIFICATION_REQUIRED");
    await assertPath(filePath, allowedRoot);
    if (apply) {
      try { lease = await acquireExclusiveWriterLease({ filePath, sourcePath: filePath, allowedRoot, expectedSha256 }); }
      catch { refuse("WRITER_LEASE_REQUIRED"); }
      await assertLease(lease);
    }
    const source = await snapshot(filePath, allowedRoot, maxBytes);
    if (source.sha256 !== expectedSha256) refuse("DIGEST_MISMATCH");
    const encoding = filePath.endsWith(".jsonl.zstd") ? "zstd" : filePath.endsWith(".jsonl") ? "none" : undefined;
    if (!encoding) refuse("INVALID_ENCODING");
    const audit = auditSessionLog(source.bytes, { encoding, maxBytes });
    if (!apply) result = receipt(audit, "DRY_RUN");
    else if (audit.changedEventCount === 0) {
      await verifyNative(verifyCandidate, filePath, filePath, filePath, audit, expectedSha256);
      await assertLease(lease);
      await assertSnapshot(filePath, allowedRoot, maxBytes, source, "SOURCE_CHANGED");
      result = receipt(audit, "ALREADY_COMPATIBLE");
    }
    else {
      const directory = dirname(filePath);
      const prefix = `${basename(filePath)}.dsmm-${randomUUID()}`;
      const backupPath = resolve(directory, `${prefix}.backup`);
      const candidatePath = resolve(directory, `${prefix}.candidate`);
      recovery.backupPath = backupPath;
      recovery.candidatePath = candidatePath;
      await assertLease(lease);
      const backup = await createPrivateFile(backupPath, source.bytes, allowedRoot, maxBytes);
      await assertLease(lease);
      const candidate = await createPrivateFile(candidatePath, audit.candidateBytes, allowedRoot, maxBytes);
      await verifyNative(verifyCandidate, candidatePath, filePath, backupPath, audit, expectedSha256);
      await assertLease(lease);
      await assertSnapshot(backupPath, allowedRoot, maxBytes, backup, "BACKUP_CHANGED");
      await assertSnapshot(candidatePath, allowedRoot, maxBytes, candidate, "CANDIDATE_CHANGED");
      await assertSnapshot(filePath, allowedRoot, maxBytes, source, "SOURCE_CHANGED");
      try { await rename(candidatePath, filePath); }
      catch { throw new SessionLogRepairError("ATOMIC_REPLACE_FAILED", recovery); }
      recovery.activeChanged = true;
      try {
        await syncDirectory(directory);
        const active = await snapshot(filePath, allowedRoot, maxBytes);
        if (active.sha256 !== audit.candidateSha256 || active.identity !== candidate.identity) refuse("POST_VERIFY_FAILED");
        await assertSnapshot(backupPath, allowedRoot, maxBytes, backup, "BACKUP_CHANGED");
        await verifyNative(verifyCandidate, filePath, filePath, backupPath, audit, expectedSha256);
        await assertLease(lease);
        await assertSnapshot(backupPath, allowedRoot, maxBytes, backup, "BACKUP_CHANGED");
        await assertSnapshot(filePath, allowedRoot, maxBytes, active, "SOURCE_CHANGED");
        result = receipt(audit, "REPAIRED", { backupPath });
      } catch {
        // Restore only our exact candidate; never overwrite an intervening edit.
        try {
          await assertLease(lease);
          const active = await snapshot(filePath, allowedRoot, maxBytes);
          if (active.sha256 !== audit.candidateSha256 || active.identity !== candidate.identity) refuse("ROLLBACK_UNSAFE");
          await assertSnapshot(backupPath, allowedRoot, maxBytes, backup, "BACKUP_CHANGED");
          const failedCandidatePath = resolve(directory, `${prefix}.failed.candidate`);
          const rollbackPath = resolve(directory, `${prefix}.rollback.candidate`);
          await createPrivateFile(failedCandidatePath, audit.candidateBytes, allowedRoot, maxBytes);
          recovery.candidatePath = failedCandidatePath;
          await createPrivateFile(rollbackPath, source.bytes, allowedRoot, maxBytes);
          await assertLease(lease);
          await assertSnapshot(filePath, allowedRoot, maxBytes, active, "ROLLBACK_UNSAFE");
          await rename(rollbackPath, filePath);
          await syncDirectory(directory);
          if ((await snapshot(filePath, allowedRoot, maxBytes)).sha256 !== expectedSha256) refuse("ROLLBACK_VERIFY_FAILED");
          recovery.activeChanged = false;
        } catch (error) {
          throw new SessionLogRepairError(safeFailure(error, "ROLLBACK_FAILED").code, recovery);
        }
        throw new SessionLogRepairError("POST_VERIFY_FAILED_ROLLED_BACK", recovery);
      }
    }
  } catch (error) {
    const safe = safeFailure(error, "IO_FAILED");
    failure = new SessionLogRepairError(safe.code, { ...recovery, ...safe.recovery });
  } finally {
    if (lease && typeof lease.release === "function") {
      try { await lease.release(); }
      catch {
        failure = new SessionLogRepairError("WRITER_LEASE_RELEASE_FAILED", { ...recovery, priorFailureCode: failure?.code });
      }
    }
  }
  if (failure) throw failure;
  return result;
}

export function parseRepairArguments(args) {
  const values = {};
  const names = { "--file": "filePath", "--sha256": "expectedSha256", "--root": "allowedRoot", "--verifier": "verifier",
    "--native-runtime-manifest": "nativeManifestPath", "--carrier-executable": "carrierExecutablePath" };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const key = names[token] ?? (token === "--apply" ? "apply" : token === "--assert-quiescent" ? "assertQuiescent" : undefined);
    if (!key || Object.hasOwn(values, key)) refuse("INVALID_ARGUMENTS");
    values[key] = key === "apply" || key === "assertQuiescent" ? true : args[++index];
    if (values[key] === undefined || typeof values[key] === "string" && values[key].startsWith("--")) refuse("INVALID_ARGUMENTS");
  }
  if (values.apply && (!values.assertQuiescent || !values.verifier)) refuse("VERIFICATION_REQUIRED");
  if (!values.apply && (values.verifier || values.assertQuiescent || values.nativeManifestPath || values.carrierExecutablePath)) refuse("INVALID_ARGUMENTS");
  if (Boolean(values.nativeManifestPath) !== Boolean(values.carrierExecutablePath)) refuse("INVALID_ARGUMENTS");
  return values;
}

async function main() {
  try {
    const { verifier, assertQuiescent: _assertion, nativeManifestPath, carrierExecutablePath, ...options } = parseRepairArguments(process.argv.slice(2));
    let callbacks = {};
    if (verifier) {
      const path = validAbsolutePath(verifier);
      if (!(await lstat(path)).isFile() || (await lstat(path)).isSymbolicLink()) refuse("UNSAFE_VERIFIER");
      try { callbacks = await import(pathToFileURL(path).href); }
      catch { refuse("VERIFIER_LOAD_FAILED"); }
      if (nativeManifestPath || carrierExecutablePath) {
        if (typeof callbacks.createNativeSessionRepairVerifier !== "function") refuse("VERIFIER_FACTORY_REQUIRED");
        try {
          callbacks = await callbacks.createNativeSessionRepairVerifier({
            nativeManifestPath: validAbsolutePath(nativeManifestPath), carrierExecutablePath: validAbsolutePath(carrierExecutablePath) });
        } catch (error) {
          throw safeFailure(error, "VERIFIER_SETUP_FAILED");
        }
      }
    }
    const result = await repairSessionLog({ ...options,
      acquireExclusiveWriterLease: callbacks.acquireExclusiveWriterLease, verifyCandidate: callbacks.verifyCandidate });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const safe = safeFailure(error, "IO_FAILED");
    process.stderr.write(`${JSON.stringify({ outcome: "REFUSED", code: safe.code, recovery: safe.recovery })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
