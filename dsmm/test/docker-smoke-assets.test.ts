import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("packed history receives exact package identity from the frozen artifact rather than its installed manifest", () => {
  const source = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  assert.match(source, /history\.runSessionHistorySmoke\(\{[\s\S]*?expectedPackage: \{ name: manifest\.name, version: manifest\.version \}/u);
  assert.doesNotMatch(source, /expectedPackage: \{ name: operatorManifest\.name/u);
});

test("frozen artifact transport binds exact read-only files without mounting a source checkout or user home", async () => {
  const { artifactDockerArguments, parseArtifactOptions } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const options = { artifact: "/owned/final-package.tgz", sha256: "a".repeat(64), hook: "/owned/final-ui-hook.mjs", requireHook: true };
  const args = artifactDockerArguments(options, "owned-native-runtime:fixture");
  const mounts = args.flatMap((arg: string, index: number) => arg === "--mount" ? [args[index + 1]] : []);
  assert.ok(mounts.every((mount: string) => mount.endsWith(",readonly")));
  assert.ok(mounts.every((mount: string) => /source=.+\.(?:mjs|tgz),target=/u.test(mount)));
  assert.ok(args.includes("--expected-sha256"));
  assert.ok(args.includes("--require-hook"));
  assert.throws(() => parseArtifactOptions([]), /exact frozen/u);
  assert.throws(() => parseArtifactOptions(["--artifact", join(packageRoot, "package.json")]), /existing \.tgz/u);
});

test("final-artifact receipt fails closed when frozen container bytes are absent or changed", async () => {
  const { parseContainerArtifactReceipt } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const sha256 = "b".repeat(64);
  const report = { outcome: "COMPLETED", artifact: { sha256, sha256After: sha256 } };
  assert.deepEqual(parseContainerArtifactReceipt(`native logs\nDSMM_FINAL_ARTIFACT_RECEIPT ${JSON.stringify(report)}\n`, sha256), report);
  assert.throws(() => parseContainerArtifactReceipt("no receipt", sha256), /did not produce/u);
  assert.throws(() => parseContainerArtifactReceipt(`DSMM_FINAL_ARTIFACT_RECEIPT ${JSON.stringify({ ...report, artifact: { sha256, sha256After: "c".repeat(64) } })}`, sha256), /unchanged frozen artifact/u);
  assert.throws(() => parseContainerArtifactReceipt(`DSMM_FINAL_ARTIFACT_RECEIPT ${JSON.stringify(report)}`, "d".repeat(64)), /unchanged frozen artifact/u);
});

test("DSH runtime input accepts only bytes matching the trusted version policy", async () => {
  const { dshTarballUrlForVersion, prepareDshRuntimeInput, verifySha512Integrity } = await import(pathToFileURL(join(packageRoot, "scripts", "prepare-dsh-runtime-input.mjs")).href);
  const bytes = Buffer.from("integrity fixture");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  assert.deepEqual(verifySha512Integrity(bytes, integrity), {
    integrity, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length,
  });
  assert.throws(() => verifySha512Integrity(Buffer.from("different"), integrity), /integrity mismatch/u);
  assert.equal(dshTarballUrlForVersion("0.3.0"), "https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-rc.1.tgz");
  const owned = await mkdtemp(join(tmpdir(), "dsmm-dsh-input-test-"));
  const destination = join(owned, "input");
  try {
    await assert.rejects(() => prepareDshRuntimeInput({ packageVersion: "0.3.1", destination }, async (url: string) => {
      assert.equal(url, dshTarballUrlForVersion("0.3.1"));
      return new Response(bytes);
    }), /integrity mismatch/u);
    assert.equal(existsSync(destination), false);
  } finally { await rm(owned, { recursive: true, force: false }); }
});

test("the exact isolated final-artifact runner mount closure loads without checkout imports", async () => {
  const { artifactDockerArguments } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const args = artifactDockerArguments({ artifact: "/owned/final-package.tgz", sha256: "a".repeat(64) }, "owned-native-runtime:fixture");
  const owned = await mkdtemp(join(tmpdir(), "dsmm-isolated-runner-"));
  try {
    const scripts = join(owned, "scripts");
    await mkdir(scripts);
    const mounts = args.flatMap((arg: string, index: number) => arg === "--mount" ? [args[index + 1]] : []);
    for (const mount of mounts) {
      const match = /^type=bind,source=(.+),target=\/dsmm-acceptance\/scripts\/([^,]+),readonly$/u.exec(mount);
      if (match) await copyFile(match[1], join(scripts, match[2]));
    }
    await import(`${pathToFileURL(join(scripts, "docker-smoke.mjs")).href}?isolated=${Date.now()}`);
  } finally { await rm(owned, { recursive: true, force: false }); }
});

test("profile hook transport refuses an incomplete stable support closure and mounts every accepted support read-only", async () => {
  const { artifactDockerArguments, parseArtifactOptions, PROFILE_UI_HARNESS_FILES } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const owned = await mkdtemp(join(tmpdir(), "dsmm-hook-transport-"));
  try {
    const artifact = join(owned, "fixture.tgz"); await writeFile(artifact, "transport-only fixture");
    const hook = join(packageRoot, "scripts", "profile-ui-acceptance.mjs");
    const supports = PROFILE_UI_HARNESS_FILES.map((file: string) => join(packageRoot, "scripts", file));
    const args = ["--artifact", artifact, "--acceptance-hook", hook, "--require-hook"];
    for (const file of supports) args.push("--hook-support", file);
    const accepted = parseArtifactOptions(args), mounts = artifactDockerArguments(accepted, "borrowed-runtime")
      .filter((arg: string) => arg.startsWith("type=bind,"));
    for (const file of supports) assert.ok(mounts.some((mount: string) => mount.includes(`source=${file},`) && mount.endsWith(",readonly")));
    for (const missing of ["stable-native-acceptance.mjs", "profile-ui-harness-stable021.mjs", "profile-ui-harness-stable021-native.mjs"]) {
      const incomplete = ["--artifact", artifact, "--acceptance-hook", hook, "--require-hook"];
      for (const file of supports.filter((file: string) => !file.endsWith(missing))) incomplete.push("--hook-support", file);
      assert.throws(() => parseArtifactOptions(incomplete), /every explicit read-only harness support/u);
    }
  } finally { await rm(owned, { recursive: true, force: false }); }
});

test("startup storage handoff preserves only captured native owned-root configuration and fails closed", async () => {
  const { preservedNativeStorage } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const ownedHome = join("/owned", "fresh-home");
  const config = { root: join(ownedHome, "sessions"), compression: "zstd" };
  const control = { outcome: "COMPLETED", persistence: { backendName: "session-persistence-jsonl", config,
    stockEntry: { id: "session-persistence-jsonl", name: "@deepseek-ai/dsh-session-persistence-jsonl", disabled: false } } };
  const preserved = preservedNativeStorage(control, ownedHome);
  assert.deepEqual(preserved, config);
  assert.notEqual(preserved, config, "only a detached root/compression copy enters DSMM startup config");
  for (const changed of [undefined, { ...control, outcome: "FAILED" },
    { ...control, persistence: { ...control.persistence, backendName: "other-backend" } },
    { ...control, persistence: { ...control.persistence, config: { ...config, root: join("/outside", "sessions") } } },
    { ...control, persistence: { ...control.persistence, config: { ...config, compression: "none" } } },
    { ...control, persistence: { ...control.persistence, stockEntry: { ...control.persistence.stockEntry, name: "other-package" } } },
    { ...control, persistence: { ...control.persistence, stockEntry: { ...control.persistence.stockEntry, disabled: true } } }
  ]) assert.throws(() => preservedNativeStorage(changed, ownedHome), /exact enabled stock backend/u);
});

test("persisted native event proof requires exact contiguous history and only audited DSMM ignorable markers", async () => {
  const { assertStoredEventPrefix } = await import(pathToFileURL(join(packageRoot, "scripts", "native-preset-smoke.mjs")).href);
  const live = [
    { seq: 0, time: 1, type: "deepwork/mode", data: { active: true } },
    { seq: 1, time: 2, type: "dsmm/role-policy", data: { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) } },
    { seq: 2, time: 3, type: "user/message", data: { fixture: "known core event" } }
  ];
  const stored = live.map((event, index) => index < 2 ? { ...event, ignorable: true } : event);
  assert.deepEqual(assertStoredEventPrefix(live, stored), { events: 3, coreEvents: 1, modeMarkers: 1, policyMarkers: 1,
    exactlyOnce: true, contiguousSeq: true, ignorable: true });
  assert.throws(() => assertStoredEventPrefix(live, stored.slice(1)), /exactly once/u);
  assert.throws(() => assertStoredEventPrefix(live, [{ ...stored[0], seq: 1 }, ...stored.slice(1)]), /contiguous/u);
  assert.throws(() => assertStoredEventPrefix(live, live), /audited DSMM metadata/u);
  assert.throws(() => assertStoredEventPrefix(live, [...stored.slice(0, 2), { ...stored[2], ignorable: true }]), /native bytes stay unchanged/u);
  assert.throws(() => assertStoredEventPrefix(live, [...stored.slice(0, 2), { ...stored[2], data: { fixture: "changed core event" } }]), /native bytes stay unchanged/u);
});

test("native final-artifact gate uses settled public native APIs and real role tools with quiescent operator repair", () => {
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  const native = readFileSync(join(packageRoot, "scripts", "native-preset-smoke.mjs"), "utf8");
  assert.match(native, /get\("appReady"\)\.onReady/u);
  assert.match(native, /registry\.list\(\)/u);
  assert.match(native, /registry\.compositionInventory\(\)/u);
  assert.match(native, /registry\.select\(parent, "dsmm-orchestrator"\)/u);
  assert.match(native, /registry\.select\(parent, "dsmm-planner"\)/u);
  assert.match(native, /name: "write", agent: parent/u);
  assert.match(native, /name: "read", agent: parent/u);
  assert.match(native, /nativeWriteAndRead: true/u);
  assert.match(native, /readFileSync\(restoredWritePath, "utf8"\), restoredWriteBytes/u);
  assert.match(native, /name: "dsmm_reviewer"/u);
  assert.match(native, /tools\.execute\(/u);
  assert.match(native, /tools\.get\(name, agent\), undefined/u);
  assert.match(native, /class AcceptanceAdapter extends LlmAdapter/u);
  assert.match(native, /persistence\[METADATA_COMPATIBILITY\], true/u);
  assert.match(native, /stock\[0\]\.options\.name, STOCK_PERSISTENCE_MODULE/u);
  assert.match(native, /stock\[0\]\.disabled, true/u);
  assert.match(native, /no second companion\/client Loader entry/u);
  assert.match(native, /await persistence\.flush\(\)/u);
  assert.match(native, /readerCtx\.plugin\(JsonlSessionPersistence/u);
  assert.match(native, /Session\.fromRestore\(/u);
  assert.match(native, /restored\.deriveMessages\(\), session\.deriveMessages\(\)/u);
  assert.match(native, /restored\.requestHeader\(\), session\.requestHeader\(\)/u);
  assert.match(native, /commands\.execute\(parent, command/u);
  assert.match(smoke, /preservedNativeStorage\(receipt\.nativeBaseline\[template\], home\)/u);
  assert.match(smoke, /id: STOCK_PERSISTENCE_ID, name: STOCK_PERSISTENCE_MODULE, disabled: true/u);
  assert.match(smoke, /sessionPersistence: \{ \.\.\.nativeStorage \}/u);
  assert.match(smoke, /nativeStorage: \{ \.\.\.installs\[0\]\.nativeStorage \}/u);
  assert.doesNotMatch(native, /\/lib\/.*(?:import|\.href)|ctx\.provide\("agentPresets"|\.emit\("app.ready"|\.credentials/u);
  const frozen = smoke.slice(smoke.indexOf("async function runInnerArtifactSmoke"), smoke.indexOf("function inside("));
  const nativeExitBoundary = frozen.indexOf("installs.push({");
  const operatorInstallBoundary = frozen.indexOf("const operatorRoot = join(owned, \"operator-runtime\")");
  const uiBoundary = frozen.indexOf("if (options.hook !== undefined)");
  assert.ok(nativeExitBoundary >= 0 && operatorInstallBoundary > nativeExitBoundary && uiBoundary > operatorInstallBoundary,
    "operator repair executes only after native Hosts exit and before any UI Host starts");
});
