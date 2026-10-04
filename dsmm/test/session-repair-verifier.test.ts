import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { constants, zstdCompressSync } from "node:zlib";
import { Context } from "@deepseek-ai/cordis";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { Session, SessionId } from "@deepseek-ai/dsh-session";

const verifierUrl = new URL("../scripts/session-repair-native-verifier.mjs", import.meta.url);
const repairUrl = new URL("../scripts/repair-session-log.mjs", import.meta.url);
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const loadVerifier = () => import(verifierUrl.href);
const execFileAsync = promisify(execFile);

async function fixture(marked = false, encoding: "none" | "zstd" = "zstd") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dsmm-session-repair-verifier-")));
  const session = Session.create(SessionId("owned-native-verifier"));
  session.append("user/message", createUserMessage({ content: [{ type: "text", text: "Synthetic verifier history." }], source: { kind: "user" } }), { surfaceOp: "append" });
  session.append("deepwork/mode", { active: true });
  session.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) });
  const rows = [session.snapshotEvents()[0], ...session.snapshotEvents().slice(1).map(event => marked ? { ...event, ignorable: true } : event)];
  const encode = (text: string) => encoding === "none" ? Buffer.from(text) : zstdCompressSync(text, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
  const original = Buffer.concat([encode(`${JSON.stringify({ type: "session", ...session.header, delegationDepth: 0 })}\n`), encode(rows.map(row => `${JSON.stringify(row)}\n`).join(""))]);
  const filePath = join(root, "_no-cwd", session.id, `session.v${session.header.version}.jsonl${encoding === "zstd" ? ".zstd" : ""}`);
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, original, { flag: "wx", mode: 0o600 });
  return { root, filePath, original, session, encoding, expectedSha256: sha256(original) };
}

test("native rc.2 refuses the same unmarked synthetic records that repaired public read restores", async () => {
  const f = await fixture();
  const ctx = new Context();
  try {
    await ctx.plugin(JsonlSessionPersistence, { root: f.root, compression: f.encoding }).await();
    await assert.rejects(ctx.sessionPersistence.open(f.session.id, "read"), { name: "SessionFormatUnsupportedError" });
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const { repairSessionLog } = await import(repairUrl.href);
    const callbacks = await createNativeSessionRepairVerifier();
    const receipt = await repairSessionLog({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256, apply: true, ...callbacks });
    assert.equal(receipt.outcome, "REPAIRED");
    assert.equal(receipt.changedEventCount, 2);
    const reader = await ctx.sessionPersistence.open(f.session.id, "read");
    try {
      const read = await reader.read();
      const restored = Session.fromRestore(reader.id, read.events, reader.header, reader.inheritedEventCount, read.eventState);
      assert.deepEqual(restored.deriveMessages(), f.session.deriveMessages());
    } finally { await reader.close(); }
    assert.equal((await readdir(dirname(f.filePath))).some(name => name.startsWith(".dsmm-native-verify-")), false);
  } finally {
    await ctx.fiber.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("helper held lease collides with a genuine public native JSONL writer and release restores access", async () => {
  const f = await fixture(true);
  const ctx = new Context();
  let lease: any;
  try {
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const callbacks = await createNativeSessionRepairVerifier();
    await ctx.plugin(JsonlSessionPersistence, { root: f.root, compression: f.encoding }).await();
    lease = await callbacks.acquireExclusiveWriterLease({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256 });
    assert.equal(await lease.assertQuiescent(), true);
    assert.equal(await lease.assertPrivateDirectory(), true);
    await assert.rejects(ctx.sessionPersistence.open(f.session.id, "write"), { name: "SessionAlreadyOwnedError" });
    await lease.release();
    const writer = await ctx.sessionPersistence.open(f.session.id, "write");
    await writer.close();
    await lease.release();
    await assert.rejects(lease.assertQuiescent(), { code: "LEASE_LOST" });
  } finally {
    await lease?.release();
    await ctx.fiber.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("genuine public native JSONL writer held lease collides with helper acquisition", async () => {
  const f = await fixture(true);
  const ctx = new Context();
  let writer: any;
  try {
    await ctx.plugin(JsonlSessionPersistence, { root: f.root, compression: f.encoding }).await();
    writer = await ctx.sessionPersistence.open(f.session.id, "write");
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const callbacks = await createNativeSessionRepairVerifier();
    await assert.rejects(callbacks.acquireExclusiveWriterLease({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256 }), { code: "WRITER_ACTIVE" });
    await writer.close();
    const lease = await callbacks.acquireExclusiveWriterLease({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256 });
    await lease.release();
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await writer?.close();
    await ctx.fiber.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("native verifier refuses fabricated success without its held writer lease", async () => {
  const f = await fixture();
  try {
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const { auditSessionLog } = await import(repairUrl.href);
    const callbacks = await createNativeSessionRepairVerifier();
    const audit = auditSessionLog(f.original);
    await assert.rejects(callbacks.verifyCandidate({ candidatePath: f.filePath, originalPath: f.filePath, sourcePath: f.filePath, ...audit, expectedSha256: f.expectedSha256 }), { code: "LEASE_REQUIRED" });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("quiescence refusal uses executable identity without exposing command lines", { skip: process.platform !== "win32" }, async () => {
  const f = await fixture(true);
  let lease: any;
  try {
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const callbacks = await createNativeSessionRepairVerifier({ carrierExecutablePath: process.execPath });
    lease = await callbacks.acquireExclusiveWriterLease({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256 });
    await assert.rejects(lease.assertQuiescent(), (error: any) => error.code === "CARRIER_ACTIVE" && error.message === "Native session verification refused: CARRIER_ACTIVE" && error.cause === undefined);
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("public native read/restore works for uncompressed logs as well", async () => {
  const f = await fixture(false, "none");
  try {
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const { repairSessionLog } = await import(repairUrl.href);
    const callbacks = await createNativeSessionRepairVerifier();
    assert.equal((await repairSessionLog({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256, encoding: f.encoding, apply: true, ...callbacks })).outcome, "REPAIRED");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("a denied source ACL cannot become a broader inherited backup ACL", { skip: process.platform !== "win32" }, async () => {
  const f = await fixture(true);
  let lease: any;
  try {
    const script = `
$ErrorActionPreference = 'Stop'
$p = $env:DSMM_TEST_ACL | ConvertFrom-Json
$guests = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-546')
$directory = [System.IO.Directory]::GetAccessControl($p.directory)
$directory.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($guests, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
[System.IO.Directory]::SetAccessControl($p.directory, $directory)
$source = [System.IO.File]::GetAccessControl($p.source)
$source.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($guests, 'ReadAndExecute', 'Deny'))
[System.IO.File]::SetAccessControl($p.source, $source)
`;
    await execFileAsync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      windowsHide: true, env: { ...process.env, DSMM_TEST_ACL: JSON.stringify({ source: f.filePath, directory: dirname(f.filePath) }) }
    });
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const callbacks = await createNativeSessionRepairVerifier();
    lease = await callbacks.acquireExclusiveWriterLease({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256 });
    await assert.rejects(lease.assertPrivateDirectory(), { code: "DIRECTORY_NOT_PRIVATE" });
    assert.deepEqual(await readdir(dirname(f.filePath)), ["session.v4.jsonl.zstd"]);
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("protected source refuses an inherit-only grant that would expose newly created recovery files", { skip: process.platform !== "win32" }, async () => {
  const f = await fixture(true);
  let lease: any;
  try {
    const script = `
$ErrorActionPreference = 'Stop'
$p = $env:DSMM_TEST_ACL | ConvertFrom-Json
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$guests = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-546')
$directory = [System.Security.AccessControl.DirectorySecurity]::new()
$directory.SetOwner($user)
$directory.SetAccessRuleProtection($true, $false)
$directory.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($user, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
$directory.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($guests, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'InheritOnly', 'Allow'))
[System.IO.Directory]::SetAccessControl($p.directory, $directory)
$source = [System.Security.AccessControl.FileSecurity]::new()
$source.SetOwner($user)
$source.SetAccessRuleProtection($true, $false)
$source.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($user, 'FullControl', 'Allow'))
[System.IO.File]::SetAccessControl($p.source, $source)
`;
    await execFileAsync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      windowsHide: true, env: { ...process.env, DSMM_TEST_ACL: JSON.stringify({ source: f.filePath, directory: dirname(f.filePath) }) }
    });
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const callbacks = await createNativeSessionRepairVerifier();
    lease = await callbacks.acquireExclusiveWriterLease({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256 });
    await assert.rejects(lease.assertPrivateDirectory(), { code: "DIRECTORY_NOT_PRIVATE" });
    assert.deepEqual(await readdir(dirname(f.filePath)), ["session.v4.jsonl.zstd"]);
    assert.deepEqual(await readFile(f.filePath), f.original);
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("already annotated native-compatible logs retain their exact original bytes", async () => {
  const f = await fixture(true);
  try {
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const { repairSessionLog } = await import(repairUrl.href);
    const callbacks = await createNativeSessionRepairVerifier();
    const receipt = await repairSessionLog({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256, apply: true, ...callbacks });
    assert.equal(receipt.outcome, "ALREADY_COMPATIBLE");
    assert.deepEqual(await readFile(f.filePath), f.original);
    assert.equal((await readdir(dirname(f.filePath))).some(name => name.startsWith(".dsmm-native-verify-")), false);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("tampered candidate and wrong native runtime fail closed without payload-bearing errors", async () => {
  const f = await fixture();
  let lease: any;
  try {
    const { createNativeSessionRepairVerifier } = await loadVerifier();
    const { auditSessionLog } = await import(repairUrl.href);
    const manifest = join(f.root, "package.json");
    await writeFile(manifest, JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.1.0" }), { flag: "wx", mode: 0o600 });
    await assert.rejects(createNativeSessionRepairVerifier({ nativeManifestPath: manifest }), { code: "INCOMPATIBLE_NATIVE_RUNTIME" });
    const callbacks = await createNativeSessionRepairVerifier();
    lease = await callbacks.acquireExclusiveWriterLease({ filePath: f.filePath, allowedRoot: f.root, expectedSha256: f.expectedSha256 });
    const audit = auditSessionLog(f.original);
    const candidatePath = join(dirname(f.filePath), "owned-tampered.candidate");
    await writeFile(candidatePath, audit.candidateBytes, { flag: "wx", mode: 0o600 });
    await assert.rejects(callbacks.verifyCandidate({ candidatePath, originalPath: f.filePath, sourcePath: f.filePath, ...audit, expectedSha256: f.expectedSha256, candidateSha256: "b".repeat(64) }),
      (error: any) => error.code === "SOURCE_CHANGED" && !error.message.includes("Synthetic verifier history") && error.cause === undefined);
    await assert.rejects(callbacks.verifyCandidate({ candidatePath, originalPath: f.filePath, sourcePath: f.filePath, ...audit, expectedSha256: f.expectedSha256, rows: [] }), { code: "RECORD_EQUALITY_FAILED" });
    assert.deepEqual(await readFile(f.filePath), f.original);
    assert.equal((await readdir(dirname(f.filePath))).some(name => name.startsWith(".dsmm-native-verify-")), false);
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
