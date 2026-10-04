import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { promisify } from "node:util";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { Session, SessionId, type SessionEvent } from "@deepseek-ai/dsh-session";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";

const repairUrl = new URL("../scripts/repair-session-log.mjs", import.meta.url);
const loadRepair = () => import(repairUrl.href);
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const compress = (value: string | Buffer) => zstdCompressSync(value, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
const execFileAsync = promisify(execFile);

interface Fixture {
  root: string;
  filePath: string;
  original: Buffer;
  frames: Buffer[];
  session: Session;
  options: { filePath: string; allowedRoot: string; expectedSha256: string };
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "dsmm-owned-session-repair-"));
  const session = Session.create(SessionId("dsmm-owned-log-repair"));
  session.append("user/message", createUserMessage({ content: [{ type: "text", text: "Synthetic retained message." }], source: { kind: "user" } }), { surfaceOp: "append" });
  session.append("deepwork/mode", { active: true });
  session.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) });
  session.append("agent-preset/selected", { agentPreset: "standard" });
  const events = session.snapshotEvents();
  const frames = [
    compress(`${JSON.stringify({ type: "session", ...session.header, delegationDepth: 0 })}\n`),
    compress(` ${JSON.stringify(events[0])}\r\n`),
    compress(`${JSON.stringify(events[1])}\n${JSON.stringify(events[2])}\n`),
    compress(`${JSON.stringify(events[3])}\n`)
  ];
  const original = Buffer.concat(frames);
  const filePath = join(root, "_no-cwd", session.id, `session.v${session.header.version}.jsonl.zstd`);
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, original, { mode: 0o600, flag: "wx" });
  return { root, filePath, original, frames, session, options: { filePath, allowedRoot: root, expectedSha256: sha256(original) } };
}

async function nativeRead(root: string, id: SessionId): Promise<Session> {
  const ctx = new Context();
  const fiber = ctx.plugin(JsonlSessionPersistence, { root, compression: "zstd" });
  assert.ok(fiber);
  try {
    await fiber.await();
    const backend = ctx.get("sessionPersistence");
    assert.ok(backend);
    const handle = await backend.open(id, "read");
    try {
      const result = await handle.read();
      return Session.fromRestore(handle.id, result.events, handle.header, handle.inheritedEventCount, result.eventState);
    } finally {
      await handle.close();
    }
  } finally {
    await ctx.fiber.dispose();
  }
}

function leaseCallbacks(extra: { assertQuiescent?: () => Promise<boolean>; assertPrivateDirectory?: () => Promise<boolean>; release?: () => Promise<void> } = {}) {
  return async () => ({
    async assertQuiescent() { return true; },
    async assertPrivateDirectory() { return true; },
    async release() {},
    ...extra
  });
}

function nativeVerifier(f: Fixture) {
  return async ({ candidatePath, events }: { candidatePath: string; events: SessionEvent[] }) => {
    const validationRoot = await mkdtemp(join(tmpdir(), "dsmm-owned-native-verify-"));
    try {
      const target = join(validationRoot, "_no-cwd", f.session.id, `session.v${f.session.header.version}.jsonl.zstd`);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, await readFile(candidatePath), { mode: 0o600, flag: "wx" });
      const restored = await nativeRead(validationRoot, f.session.id);
      assert.deepEqual(restored.snapshotEvents().slice(0, events.length), events);
      assert.deepEqual(restored.deriveMessages(), f.session.deriveMessages());
      return { publicRead: true, restored: true, historyEqual: true };
    } finally {
      await rm(validationRoot, { recursive: true, force: true });
    }
  };
}

test("native rc.2 refuses unmarked DSMM events before granting a public read handle", async () => {
  const f = await fixture();
  try {
    assert.equal(Object.hasOwn(f.session.snapshotEvents()[1]!, "ignorable"), false);
    await assert.rejects(nativeRead(f.root, f.session.id), { name: "SessionFormatUnsupportedError" });
    await assert.rejects(nativeRead(f.root, f.session.id), { name: "SessionFormatUnsupportedError" });
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("dry-run changes only audited metadata and only the frames containing it, with zero filesystem writes", async () => {
  const { auditSessionLog, repairSessionLog, scanZstdFrames } = await loadRepair();
  const f = await fixture();
  try {
    const before = await readdir(dirname(f.filePath));
    const receipt = await repairSessionLog(f.options);
    assert.equal(receipt.outcome, "DRY_RUN");
    assert.equal(receipt.changedEventCount, 2);
    assert.equal(receipt.changedFrameCount, 1);
    assert.deepEqual(await readFile(f.filePath), f.original);
    assert.deepEqual(await readdir(dirname(f.filePath)), before);
    const audit = auditSessionLog(f.original);
    assert.deepEqual(audit.header, { type: "session", ...f.session.header, delegationDepth: 0 });
    assert.deepEqual(audit.events, f.session.snapshotEvents().map(event => event.type === "deepwork/mode" || event.type === "dsmm/role-policy" ? { ...event, ignorable: true } : event));
    const frames = scanZstdFrames(audit.candidateBytes);
    for (const index of [0, 1, 3]) {
      assert.deepEqual(audit.candidateBytes.subarray(frames[index].start, frames[index].end), f.frames[index]);
    }
    const changed = zstdDecompressSync(audit.candidateBytes.subarray(frames[2].start, frames[2].end));
    assert.match(changed.toString("utf8"), /,"ignorable":true\}/u);
    assert.equal(auditSessionLog(audit.candidateBytes).changedEventCount, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("explicit repair retains an exact original backup and proves public native read, restore, and visible history", async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  let releases = 0;
  let nativeChecks = 0;
  try {
    const verify = nativeVerifier(f);
    const receipt = await repairSessionLog({ ...f.options, apply: true,
      acquireExclusiveWriterLease: leaseCallbacks({ async release() { releases += 1; } }),
      async verifyCandidate(value: { candidatePath: string; events: SessionEvent[] }) { nativeChecks += 1; return verify(value); }
    });
    assert.equal(receipt.outcome, "REPAIRED");
    assert.equal(nativeChecks, 2);
    assert.equal(releases, 1);
    assert.equal(sha256(await readFile(f.filePath)), receipt.candidateSha256);
    assert.deepEqual(await readFile(receipt.backupPath), f.original);
    assert.equal(sha256(await readFile(receipt.backupPath)), f.options.expectedSha256);
    if (process.platform !== "win32") assert.equal((await stat(receipt.backupPath)).mode & 0o777, 0o600);
    const restored = await nativeRead(f.root, f.session.id);
    assert.deepEqual(restored.deriveMessages(), f.session.deriveMessages());
    assert.equal(restored.snapshotEvents()[1]?.ignorable, true);
    assert.equal(restored.snapshotEvents()[2]?.ignorable, true);
    assert.equal(f.session.snapshotEvents()[1]?.ignorable, undefined);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("the audited synthetic candidate independently passes the public native codec and visible-history restore", async () => {
  const { auditSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    const audit = auditSessionLog(f.original);
    const candidatePath = join(dirname(f.filePath), "owned-candidate-for-native-proof");
    await writeFile(candidatePath, audit.candidateBytes, { flag: "wx", mode: 0o600 });
    assert.deepEqual(await nativeVerifier(f)({ candidatePath, events: audit.events }), { publicRead: true, restored: true, historyEqual: true });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("verified already-compatible apply performs no replacement or artifact writes", async () => {
  const { auditSessionLog, repairSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    const audit = auditSessionLog(f.original);
    await writeFile(f.filePath, audit.candidateBytes);
    const before = await stat(f.filePath, { bigint: true });
    const files = await readdir(dirname(f.filePath));
    const receipt = await repairSessionLog({ ...f.options, expectedSha256: sha256(audit.candidateBytes), apply: true,
      acquireExclusiveWriterLease: leaseCallbacks(), verifyCandidate: nativeVerifier(f) });
    assert.equal(receipt.outcome, "ALREADY_COMPATIBLE");
    assert.equal(receipt.changedEventCount, 0);
    assert.deepEqual(await readdir(dirname(f.filePath)), files);
    const after = await stat(f.filePath, { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeNs, before.mtimeNs);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("apply fails closed without verifiable quiescence, privacy, held writer lease, and complete native proof", async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    for (const extra of [
      {},
      { acquireExclusiveWriterLease: leaseCallbacks() },
      { verifyCandidate: nativeVerifier(f) },
      { acquireExclusiveWriterLease: async () => ({ release() {} }), verifyCandidate: nativeVerifier(f) },
      { acquireExclusiveWriterLease: leaseCallbacks({ async assertQuiescent() { return false; } }), verifyCandidate: nativeVerifier(f) },
      { acquireExclusiveWriterLease: leaseCallbacks({ async assertPrivateDirectory() { return false; } }), verifyCandidate: nativeVerifier(f) }
    ]) {
      await assert.rejects(repairSessionLog({ ...f.options, apply: true, ...extra }));
      assert.deepEqual(await readFile(f.filePath), f.original);
      assert.deepEqual(await readdir(dirname(f.filePath)), [join(f.filePath).split(/[\\/]/u).at(-1)]);
    }
    await assert.rejects(repairSessionLog({ ...f.options, apply: true, acquireExclusiveWriterLease: leaseCallbacks(), async verifyCandidate() { return { publicRead: true }; } }), { code: "NATIVE_VERIFY_FAILED" });
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("native verification failure keeps the original active and never logs raw callback payloads", async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  const privateSentinel = "DO_NOT_LEAK_SYNTHETIC_PAYLOAD";
  try {
    await assert.rejects(repairSessionLog({ ...f.options, apply: true, acquireExclusiveWriterLease: leaseCallbacks(), async verifyCandidate() { throw new Error(privateSentinel); } }), (error: unknown) => {
      assert.match(String(error), /NATIVE_VERIFY_FAILED/u);
      assert.doesNotMatch(String(error), new RegExp(privateSentinel, "u"));
      return true;
    });
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("quiescence is rechecked after audit before any private backup payload is written", async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  let probes = 0;
  try {
    const before = await readdir(dirname(f.filePath));
    await assert.rejects(repairSessionLog({ ...f.options, apply: true,
      acquireExclusiveWriterLease: leaseCallbacks({ async assertQuiescent() { probes += 1; return probes === 1; } }),
      verifyCandidate: nativeVerifier(f) }), { code: "QUIESCENCE_REQUIRED" });
    assert.deepEqual(await readdir(dirname(f.filePath)), before);
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("post-replacement native verification failure rolls back atomically from the exact retained backup", async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  let calls = 0;
  try {
    const verify = nativeVerifier(f);
    await assert.rejects(repairSessionLog({ ...f.options, apply: true, acquireExclusiveWriterLease: leaseCallbacks(), async verifyCandidate(value: { candidatePath: string; events: SessionEvent[] }) {
      calls += 1;
      if (calls === 2) throw new Error("synthetic post-replacement refusal");
      return verify(value);
    } }), { code: "POST_VERIFY_FAILED_ROLLED_BACK" });
    assert.equal(calls, 2);
    assert.deepEqual(await readFile(f.filePath), f.original);
    const backups = (await readdir(dirname(f.filePath))).filter(name => name.endsWith(".backup"));
    assert.equal(backups.length, 1);
    assert.deepEqual(await readFile(join(dirname(f.filePath), backups[0]!)), f.original);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("digest mismatch and source drift fail closed without overwriting a later edit", async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    await assert.rejects(repairSessionLog({ ...f.options, expectedSha256: "0".repeat(64) }), { code: "DIGEST_MISMATCH" });
    const later = Buffer.concat([f.original, compress("\n")]);
    await assert.rejects(repairSessionLog({ ...f.options, apply: true, acquireExclusiveWriterLease: leaseCallbacks(), async verifyCandidate() {
      await writeFile(f.filePath, later);
      return { publicRead: true, restored: true, historyEqual: true };
    } }), { code: "SOURCE_CHANGED" });
    assert.deepEqual(await readFile(f.filePath), later);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a verifier cannot alter the staged candidate or exact backup before replacement", async () => {
  const { repairSessionLog } = await loadRepair();
  for (const target of ["candidatePath", "originalPath"] as const) {
    const f = await fixture();
    try {
      await assert.rejects(repairSessionLog({ ...f.options, apply: true, acquireExclusiveWriterLease: leaseCallbacks(),
        async verifyCandidate(value: { candidatePath: string; originalPath: string }) {
          await writeFile(value[target], compress("tampered synthetic bytes\n"));
          return { publicRead: true, restored: true, historyEqual: true };
        }
      }), { code: target === "candidatePath" ? "CANDIDATE_CHANGED" : "BACKUP_CHANGED" });
      assert.deepEqual(await readFile(f.filePath), f.original);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test("a later active edit after replacement is never overwritten by rollback", async () => {
  const { auditSessionLog, repairSessionLog } = await loadRepair();
  const f = await fixture();
  let calls = 0;
  const later = Buffer.concat([auditSessionLog(f.original).candidateBytes, compress("\n")]);
  try {
    const verify = nativeVerifier(f);
    await assert.rejects(repairSessionLog({ ...f.options, apply: true, acquireExclusiveWriterLease: leaseCallbacks(),
      async verifyCandidate(value: { candidatePath: string; events: SessionEvent[] }) {
        calls += 1;
        const proof = await verify(value);
        if (calls === 2) await writeFile(f.filePath, later);
        return proof;
      }
    }), (error: unknown) => {
      const failure = error as { code: string; recovery: { activeChanged: boolean } };
      assert.equal(failure.code, "ROLLBACK_UNSAFE");
      assert.equal(failure.recovery.activeChanged, true);
      return true;
    });
    assert.deepEqual(await readFile(f.filePath), later);
    const backups = (await readdir(dirname(f.filePath))).filter(name => name.endsWith(".backup"));
    assert.equal(backups.length, 1);
    assert.deepEqual(await readFile(join(dirname(f.filePath), backups[0]!)), f.original);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Windows atomic replacement failure leaves the exact original active without an unlink fallback", { skip: process.platform !== "win32" }, async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  const lock = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$repairStream = [IO.File]::Open($env:DSMM_REPAIR_LOCK_TARGET, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite); try { [Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null } finally { $repairStream.Dispose() }"
  ], { env: { ...process.env, DSMM_REPAIR_LOCK_TARGET: f.filePath }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise<void>((resolve, reject) => {
    lock.once("error", reject);
    lock.once("exit", code => code === 0 ? resolve() : reject(new Error("owned Windows lock helper failed")));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      lock.stdout.on("data", chunk => { output += String(chunk); if (output.includes("READY")) resolve(); });
      lock.once("error", reject);
      lock.once("exit", () => reject(new Error("owned Windows lock helper exited before readiness")));
    });
    await assert.rejects(repairSessionLog({ ...f.options, apply: true, acquireExclusiveWriterLease: leaseCallbacks(), verifyCandidate: nativeVerifier(f) }), { code: "ATOMIC_REPLACE_FAILED" });
    assert.deepEqual(await readFile(f.filePath), f.original);
    const artifacts = await readdir(dirname(f.filePath));
    assert.ok(artifacts.some(name => name.endsWith(".candidate")));
    assert.ok(artifacts.some(name => name.endsWith(".backup")));
  } finally {
    lock.stdin.end("release\n");
    await closed;
    await rm(f.root, { recursive: true, force: true });
  }
});

test("rejects linked targets, path escape, relative paths, and unpaired path surrogates", async () => {
  const { repairSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    const hardlinkPath = join(dirname(f.filePath), "hardlink.jsonl.zstd");
    await link(f.filePath, hardlinkPath);
    await assert.rejects(repairSessionLog(f.options), { code: "UNSAFE_PATH" });
    await rm(hardlinkPath);
    const linkPath = join(dirname(f.filePath), "symlink.jsonl.zstd");
    await symlink(f.filePath, linkPath, "file");
    await assert.rejects(repairSessionLog({ ...f.options, filePath: linkPath }), { code: "UNSAFE_PATH" });
    const linkedDirectory = join(f.root, "linked-parent");
    await symlink(dirname(f.filePath), linkedDirectory, "junction");
    await assert.rejects(repairSessionLog({ ...f.options, filePath: join(linkedDirectory, `session.v${f.session.header.version}.jsonl.zstd`) }), { code: "UNSAFE_PATH" });
    await assert.rejects(repairSessionLog({ ...f.options, allowedRoot: join(f.root, "another-root") }), { code: "UNSAFE_PATH" });
    await assert.rejects(repairSessionLog({ ...f.options, filePath: `${dirname(f.filePath)}${sep}..${sep}outside` }), { code: "UNSAFE_PATH" });
    await assert.rejects(repairSessionLog({ ...f.options, filePath: "relative.jsonl.zstd" }), { code: "UNSAFE_PATH" });
    await assert.rejects(repairSessionLog({ ...f.options, filePath: `${f.filePath}\uD800` }), { code: "UNSAFE_PATH" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("rejects corrupt, torn, non-checksummed frames, malformed DSMM envelopes, unknown required rows, and duplicate JSON keys", async () => {
  const { auditSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    const brokenChecksum = Buffer.from(f.original);
    brokenChecksum[brokenChecksum.length - 1] = brokenChecksum[brokenChecksum.length - 1]! ^ 1;
    assert.throws(() => auditSessionLog(brokenChecksum), { code: "CORRUPT_FRAME" });
    assert.throws(() => auditSessionLog(f.original.subarray(0, -1)), { code: "TORN_FRAME" });
    assert.throws(() => auditSessionLog(zstdCompressSync("{}\n")), { code: "UNCHECKSUMMED_FRAME" });
    const header = `${JSON.stringify({ type: "session", ...f.session.header, delegationDepth: 0 })}\n`;
    for (const event of [
      { seq: 0, time: 1, type: "deepwork/mode", data: { active: "true" } },
      { seq: 0, time: 1, type: "deepwork/mode", data: { active: true }, surfaceOp: "append" },
      { seq: 0, time: 1, type: "deepwork/mode", data: { active: true }, sourceEventSeqs: [] },
      { seq: 0, time: 1, type: "deepwork/mode", data: { active: true }, extra: "refused" },
      { seq: 0, time: 1, type: "dsmm/role-policy", data: { version: 1, role: "not-canonical", policy: null } },
      { seq: 0, time: 1, type: "dsmm/role-policy", data: { version: 1, role: "dsmm-reviewer", policy: "not-hex" } },
      { seq: 0, time: 1, type: "deepwork/mode", data: { active: true }, ignorable: false },
      { seq: 0, time: 1, type: "required/plugin-unknown", data: {} },
      { seq: 1, time: 1, type: "deepwork/mode", data: { active: true } }
    ]) assert.throws(() => auditSessionLog(compress(`${header}${JSON.stringify(event)}\n`)));
    assert.throws(() => auditSessionLog(compress(`${header}{"seq":0,"time":1,"type":"deepwork/mode","data":{"active":true,"active":false}}\n`)), { code: "INVALID_JSON" });
    assert.throws(() => auditSessionLog(compress(`${header}{"seq":0,"time":1,"type":"foreign/plugin","data":{"text":"\\uD800"},"ignorable":true}\n`)), { code: "INVALID_JSON" });
    assert.throws(() => auditSessionLog(compress(header.slice(0, -1))), { code: "TORN_RECORD" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("plain JSONL retains all original row bytes apart from the appended marker", async () => {
  const { auditSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    const header = `${JSON.stringify({ type: "session", ...f.session.header, delegationDepth: 0 })}\n`;
    const row = '  { "seq":0, "time":1, "type":"deepwork/mode", "data": {"active": false} } \r\n';
    const audit = auditSessionLog(Buffer.from(header + row), { encoding: "none" });
    assert.equal(audit.candidateBytes.toString("utf8"), header + row.replace('} \r\n', ',"ignorable":true} \r\n'));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a DSMM record crossing frame boundaries changes only its marker-bearing frame", async () => {
  const { auditSessionLog, scanZstdFrames } = await loadRepair();
  const f = await fixture();
  try {
    const header = `${JSON.stringify({ type: "session", ...f.session.header, delegationDepth: 0 })}\n`;
    const row = '{"seq":0,"time":1,"type":"deepwork/mode","data":{"active":true}}\n';
    const prefix = compress(header + row.slice(0, 30));
    const suffix = compress(row.slice(30));
    const audit = auditSessionLog(Buffer.concat([prefix, suffix]));
    const frames = scanZstdFrames(audit.candidateBytes);
    assert.equal(audit.changedEventCount, 1);
    assert.equal(audit.changedFrameCount, 1);
    assert.deepEqual(audit.candidateBytes.subarray(frames[0].start, frames[0].end), prefix);
    assert.equal(audit.events[0].ignorable, true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("an already ignorable unrelated extension remains byte-identical and unknown headers are refused", async () => {
  const { auditSessionLog, repairSessionLog } = await loadRepair();
  const f = await fixture();
  try {
    const header = `${JSON.stringify({ type: "session", ...f.session.header, delegationDepth: 0 })}\n`;
    const row = '{"seq":0,"time":1,"type":"another/plugin","data":{"retained":true},"ignorable":true}\n';
    const bytes = compress(header + row);
    assert.deepEqual(auditSessionLog(bytes).candidateBytes, bytes);
    assert.throws(() => auditSessionLog(compress(header.replace('"version":4', '"version":5') + row)), { code: "UNSUPPORTED_HEADER" });
    await assert.rejects(repairSessionLog({ ...f.options, maxBytes: f.original.length - 1 }), { code: "INPUT_LIMIT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("actual CLI defaults to dry-run and refuses an apply boolean without a trusted verifier module", async () => {
  const f = await fixture();
  try {
    const args = [repairUrl.pathname.replace(/^\/([A-Za-z]:)/u, "$1"), "--file", f.filePath, "--sha256", f.options.expectedSha256, "--root", f.root];
    const result = await execFileAsync(process.execPath, args);
    assert.equal(JSON.parse(result.stdout).outcome, "DRY_RUN");
    assert.equal(result.stderr, "");
    await assert.rejects(execFileAsync(process.execPath, [...args, "--apply", "--assert-quiescent"]), (error: unknown) => {
      const failure = error as { stderr: string };
      assert.match(failure.stderr, /VERIFICATION_REQUIRED/u);
      assert.doesNotMatch(failure.stderr, /Synthetic retained message/u);
      return true;
    });
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("CLI native factory paths are explicit and paired, without changing direct callback compatibility", async () => {
  const { parseRepairArguments } = await loadRepair();
  const base = ["--file", "explicit", "--sha256", "digest", "--root", "root", "--apply", "--assert-quiescent", "--verifier", "verifier"];
  assert.equal(parseRepairArguments(base).verifier, "verifier");
  assert.throws(() => parseRepairArguments([...base, "--native-runtime-manifest", "manifest"]), { code: "INVALID_ARGUMENTS" });
  const parsed = parseRepairArguments([...base, "--native-runtime-manifest", "manifest", "--carrier-executable", "carrier"]);
  assert.equal(parsed.nativeManifestPath, "manifest");
  assert.equal(parsed.carrierExecutablePath, "carrier");
});
