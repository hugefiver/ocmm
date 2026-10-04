import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

/** Actual packed operator scripts, ordinary pinned SDK install, synthetic history only. */
export async function runSessionHistorySmoke({ artifact, sha256, ownedRoot, operatorPackageRoot, operatorRequire }) {
  assert.equal(digest(await readFile(artifact)), sha256);
  const owned = await realpath(ownedRoot);
  const packageRoot = await realpath(operatorPackageRoot);
  const subpath = relative(owned, packageRoot);
  assert.ok(subpath && !subpath.startsWith("..") && !isAbsolute(subpath));
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, "@dsmm/dsmm");
  assert.equal(manifest.version, "0.1.2");
  const load = specifier => import(pathToFileURL(operatorRequire.resolve(specifier)).href);
  const [{ Context }, { Session, SessionId }, { default: Jsonl }, { createUserMessage }, repair, verifier] = await Promise.all([
    load("@deepseek-ai/cordis"), load("@deepseek-ai/dsh-session"), load("@deepseek-ai/dsh-session-persistence-jsonl"),
    load("@deepseek-ai/dsh-llm"), import(pathToFileURL(join(packageRoot, "scripts", "repair-session-log.mjs")).href),
    import(pathToFileURL(join(packageRoot, "scripts", "session-repair-native-verifier.mjs")).href)
  ]);
  for (const name of ["@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence-jsonl"]) {
    assert.equal(JSON.parse(await readFile(operatorRequire.resolve(`${name}/package.json`), "utf8")).version, "0.2.0-rc.2");
  }
  const root = join(owned, "synthetic-session-repair");
  await mkdir(root, { mode: 0o700 });
  const source = Session.create(SessionId("session-dsmm-artifact-history"));
  source.append("user/message", createUserMessage({ content: [{ type: "text", text: "Retained synthetic Docker history." }], source: { kind: "user" } }), { surfaceOp: "append" });
  source.append("deepwork/mode", { active: true });
  source.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) });
  const sourceEvents = source.snapshotEvents();
  const callbacks = await verifier.createNativeSessionRepairVerifier({ nativeRequire: operatorRequire });
  const filePath = join(root, "_no-cwd", source.id, "session.v4.jsonl.zstd");
  const ctx = new Context();
  let writer;
  let original;
  try {
    await ctx.plugin(Jsonl, { root, compression: "zstd" }).await();
    writer = await ctx.sessionPersistence.create({ ...source.header, delegationDepth: 0 });
    await writer.append(sourceEvents);
    await writer.flush();
    original = await readFile(filePath);
    await assert.rejects(callbacks.acquireExclusiveWriterLease({ filePath, allowedRoot: root, expectedSha256: digest(original) }));
  } finally { try { await writer?.close(); } finally { await ctx.fiber.dispose(); } }
  const readNative = async () => {
    const cold = new Context();
    let reader;
    try {
      await cold.plugin(Jsonl, { root, compression: "zstd" }).await();
      reader = await cold.sessionPersistence.open(source.id, "read");
      const values = await reader.read();
      return Session.fromRestore(reader.id, values.events, reader.header, reader.inheritedEventCount, values.eventState);
    } finally { try { await reader?.close(); } finally { await cold.fiber.dispose(); } }
  };
  await assert.rejects(readNative(), { name: "SessionFormatUnsupportedError" });
  const options = { filePath, allowedRoot: root, expectedSha256: digest(original) };
  const dryRun = await repair.repairSessionLog(options);
  assert.equal(dryRun.outcome, "DRY_RUN");
  assert.equal(dryRun.changedEventCount, 2);
  assert.deepEqual(await readFile(filePath), original);
  const result = await repair.repairSessionLog({ ...options, apply: true, ...callbacks });
  assert.equal(result.outcome, "REPAIRED");
  assert.deepEqual(await readFile(result.backupPath), original);
  const restored = await readNative();
  const persisted = restored.snapshotEvents().slice(0, sourceEvents.length);
  assert.deepEqual(persisted, sourceEvents.map(event => /^(?:deepwork\/mode|dsmm\/role-policy)$/u.test(event.type) ? { ...event, ignorable: true } : event));
  assert.deepEqual(restored.deriveMessages(), source.deriveMessages());
  const activeSha256 = digest(await readFile(filePath));
  assert.equal(activeSha256, result.candidateSha256);
  const held = await callbacks.acquireExclusiveWriterLease({ filePath, allowedRoot: root, expectedSha256: activeSha256 });
  const contender = new Context();
  try {
    await contender.plugin(Jsonl, { root, compression: "zstd" }).await();
    await assert.rejects(contender.sessionPersistence.open(source.id, "write"), { name: "SessionAlreadyOwnedError" });
  } finally { try { await contender.fiber.dispose(); } finally { await held.release(); } }
  assert.equal(digest(await readFile(artifact)), sha256);
  return { outcome: "COMPLETED", artifactSha256: sha256, packageVersion: manifest.version, nativeVersion: "0.2.0-rc.2",
    syntheticOnly: true, originalRefused: true, dryRunUnchanged: true, originalBackupByteIdentical: true,
    repairedNativeReadAndRestore: true, retainedModelVisibleHistory: true, nativeWriterExclusionBothDirections: true,
    exactMetadataEvents: result.changedEventCount, originalSha256: result.originalSha256, repairedSha256: activeSha256 };
}
