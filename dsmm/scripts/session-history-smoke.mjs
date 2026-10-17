import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { dshPolicyForVersion } from "./release-contract.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

/** Current native SDK persistence only; no legacy repair or user-history migration. */
export async function runSessionHistorySmoke({ artifact, sha256, ownedRoot, operatorPackageRoot, operatorRequire, expectedPackage }) {
  assert.equal(digest(await readFile(artifact)), sha256);
  const owned = await realpath(ownedRoot);
  const packageRoot = await realpath(operatorPackageRoot);
  const subpath = relative(owned, packageRoot);
  assert.ok(subpath && !subpath.startsWith("..") && !isAbsolute(subpath));
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(expectedPackage?.name, "@dsmm/dsmm", "frozen package identity is required");
  assert.match(expectedPackage?.version ?? "", /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
  assert.equal(manifest.name, expectedPackage.name);
  assert.equal(manifest.version, expectedPackage.version);
  const { sdkVersion } = dshPolicyForVersion(expectedPackage.version);
  const load = specifier => import(pathToFileURL(operatorRequire.resolve(specifier)).href);
  const [{ Context }, { Session, SessionId }, Jsonl, { createUserMessage }] = await Promise.all([
    load("@deepseek-ai/cordis"), load("@deepseek-ai/dsh-session"), load("@deepseek-ai/dsh-session-persistence-jsonl"), load("@deepseek-ai/dsh-llm")
  ]);
  for (const name of ["@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence-jsonl"]) {
    assert.equal(JSON.parse(await readFile(operatorRequire.resolve(`${name}/package.json`), "utf8")).version, sdkVersion);
  }
  const root = join(owned, "synthetic-current-session");
  await mkdir(root, { mode: 0o700 });
  const source = Session.create(SessionId("session-dsmm-artifact-history"));
  source.append("user/message", createUserMessage({ content: [{ type: "text", text: "Retained synthetic Docker history." }], source: { kind: "user" } }), { surfaceOp: "append" });
  source.append("deepwork/mode", { active: true });
  source.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) });
  const sourceEvents = source.snapshotEvents().map(event => /^(?:deepwork\/mode|dsmm\/role-policy)$/u.test(event.type) ? { ...event, ignorable: true } : event);
  const ctx = new Context();
  let writer;
  let writerExclusion = false;
  try {
    await ctx.plugin(Jsonl, { root, compression: "zstd" }).await();
    writer = await ctx.sessionPersistence.create({ ...source.header, delegationDepth: 0 });
    await writer.append(sourceEvents);
    await writer.flush();
    const contender = new Context();
    try {
      await contender.plugin(Jsonl, { root, compression: "zstd" }).await();
      await assert.rejects(contender.sessionPersistence.open(source.id, "write"), { name: "SessionAlreadyOwnedError" });
      writerExclusion = true;
    } finally { await contender.fiber.dispose(); }
  } finally { try { await writer?.close(); } finally { await ctx.fiber.dispose(); } }
  const cold = new Context();
  let reader;
  let persisted;
  try {
    await cold.plugin(Jsonl, { root, compression: "zstd" }).await();
    reader = await cold.sessionPersistence.open(source.id, "read");
    assert.ok(reader, "current native session was not readable after writer release");
    const values = await reader.read();
    persisted = values.events;
    const restored = Session.fromRestore(reader.id, values.events, reader.header, reader.inheritedEventCount, values.eventState);
    assert.deepEqual(restored.snapshotEvents().slice(0, sourceEvents.length), sourceEvents);
    assert.deepEqual(restored.deriveMessages(), source.deriveMessages());
  } finally { try { await reader?.close(); } finally { await cold.fiber.dispose(); } }
  assert.equal(digest(await readFile(artifact)), sha256);
  return { outcome: "COMPLETED", artifactSha256: sha256, packageVersion: manifest.version, nativeVersion: sdkVersion,
    syntheticOnly: true, currentNativeWriteRead: true, currentIgnorableMetadata: true,
    retainedModelVisibleHistory: true, nativeWriterExclusion: writerExclusion,
    exactMetadataEvents: persisted.filter(event => /^(?:deepwork\/mode|dsmm\/role-policy)$/u.test(event.type) && event.ignorable === true).length };
}
