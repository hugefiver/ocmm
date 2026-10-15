import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_BUNDLE, MODULE_REPLACEMENTS, inspectColdComposition } from "./cold-profile-composition.mjs";
import {
  ColdProfileMigrationError, bundleToken, digest, jsonDocument, loadColdProfileSdk,
  plainPath, refuse, replaceBundleToken,
} from "./cold-profile-sources.mjs";

export { ColdProfileMigrationError, loadColdProfileSdk };
const RECEIPT = ".dsmm-cold-profile.json";
const PROJECTION_PREFIX = "@dsmm/cold-base-";
const ownName = name => typeof name === "string" && /^@dsmm\/cold-base-[0-9a-f-]{36}$/.test(name);

function normalizeOptions(input) {
  if (!input || !["dsh-tui", "desktop"].includes(input.target)) refuse("EXPLICIT_TARGET_REQUIRED");
  for (const key of ["profileDir", "installAnchor", "home"]) {
    if (typeof input[key] !== "string" || !isAbsolute(input[key])) refuse("EXPLICIT_ABSOLUTE_SCOPE_REQUIRED");
  }
  const profileDir = plainPath(resolve(input.profileDir));
  const home = plainPath(resolve(input.home));
  if (profileDir === parse(profileDir).root || home === parse(home).root || profileDir === home) refuse("INVALID_DIRECTORY_SCOPE");
  if (!lstatSync(profileDir).isDirectory() || !lstatSync(home).isDirectory()) refuse("INVALID_DIRECTORY_SCOPE");
  const overlays = input.overlays ?? [];
  const sourceRoots = input.sourceRoots ?? [profileDir, home];
  if (!Array.isArray(overlays) || !Array.isArray(sourceRoots) || ![...overlays, ...sourceRoots].every(value => typeof value === "string" && isAbsolute(value))) refuse("EXPLICIT_ABSOLUTE_SCOPE_REQUIRED");
  if (input.rootConfig !== undefined && (typeof input.rootConfig !== "string" || !isAbsolute(input.rootConfig))) refuse("EXPLICIT_ABSOLUTE_SCOPE_REQUIRED");
  if (input.migrateShell !== undefined && typeof input.migrateShell !== "boolean") refuse("INVALID_SHELL_OPTION");
  if (input.migrateSubagent !== undefined && typeof input.migrateSubagent !== "boolean") refuse("INVALID_SUBAGENT_OPTION");
  if (input.migrateSessionPersistence !== undefined && typeof input.migrateSessionPersistence !== "boolean") refuse("INVALID_SESSION_PERSISTENCE_OPTION");
  return {
    target: input.target, profileDir, home, installAnchor: resolve(input.installAnchor),
    overlays: overlays.map(filename => plainPath(resolve(filename))),
    sourceRoots: [...new Set(sourceRoots.map(filename => plainPath(resolve(filename))))],
    migrateShell: input.migrateShell ?? true,
    migrateSubagent: input.migrateSubagent ?? false,
    migrateSessionPersistence: input.migrateSessionPersistence ?? false,
    ...(input.rootConfig ? { rootConfig: plainPath(resolve(input.rootConfig)) } : {}),
  };
}

function projectionDir(options, name) {
  if (!ownName(name)) refuse("INVALID_PROJECTION_IDENTITY");
  return plainPath(join(options.profileDir, "node_modules", "@dsmm", basename(name)), { missing: true });
}

function activeReceipt(options) {
  const text = readFileSync(join(options.profileDir, "package.json"), "utf8");
  const bundles = jsonDocument(text).value.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) refuse("INVALID_BUNDLES");
  const owned = bundles.filter(name => typeof name === "string" && name.startsWith(PROJECTION_PREFIX));
  if (owned.length === 0) return undefined;
  if (owned.length !== 1 || bundles.includes(BASE_BUNDLE)) refuse("AMBIGUOUS_PROJECTION");
  return readReceipt(options, owned[0]);
}

function readReceipt(options, name) {
  const dir = projectionDir(options, name);
  const receiptPath = plainPath(join(dir, RECEIPT));
  const receipt = jsonDocument(readFileSync(receiptPath, "utf8")).value;
  if (receipt.version !== 1 || receipt.projectionName !== name || receipt.profileDir !== options.profileDir ||
      receipt.target !== options.target || receipt.home !== options.home || receipt.installAnchor !== options.installAnchor ||
      receipt.migrateShell !== options.migrateShell || receipt.migrateSubagent !== options.migrateSubagent || !Number.isSafeInteger(receipt.slot) || receipt.slot < 0 ||
      receipt.migrateSessionPersistence !== options.migrateSessionPersistence ||
      !Array.isArray(receipt.changes) || !Array.isArray(receipt.outputs) ||
      receipt.outputs.length !== 2 || receipt.outputs[0].name !== "package.json" || receipt.outputs[1].name !== "cordis.patch.yml" ||
      receipt.originalLiteral === undefined || JSON.parse(receipt.originalLiteral) !== BASE_BUNDLE ||
      ![receipt.sourceRevision, receipt.beforeHash, receipt.afterHash, ...receipt.outputs.map(output => output.hash)].every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) refuse("INVALID_RECEIPT");
  if (receipt.changes.length < 2 || receipt.changes.length > Object.keys(MODULE_REPLACEMENTS).length ||
      new Set(receipt.changes.map(change => change.id)).size !== receipt.changes.length ||
       !receipt.changes.some(change => change.id === "llm" && change.original === "@deepseek-ai/dsh-llm") ||
       !receipt.changes.some(change => change.id === "settings" && change.original === "@deepseek-ai/dsh-settings") ||
      receipt.changes.some(change => change.original === "@deepseek-ai/dsh-subagent") !== options.migrateSubagent ||
      receipt.changes.some(change => change.original === "@deepseek-ai/dsh-subagent" && change.id !== "subagent") ||
      receipt.changes.some(change => change.original === "@deepseek-ai/dsh-session-persistence-jsonl") !== options.migrateSessionPersistence ||
      receipt.changes.some(change => change.original === "@deepseek-ai/dsh-session-persistence-jsonl" && change.id !== "session-persistence-jsonl") ||
      !receipt.changes.every(change => typeof change.id === "string" && Object.hasOwn(MODULE_REPLACEMENTS, change.original) && change.replacement === MODULE_REPLACEMENTS[change.original])) refuse("INVALID_RECEIPT");
  for (const output of receipt.outputs) {
    const filename = plainPath(join(dir, output.name));
    if (digest(readFileSync(filename)) !== output.hash) refuse("OWNED_OUTPUT_CONFLICT");
  }
  return receipt;
}

function summary(inspection, receipt) {
  return {
    status: receipt ? "already-applied" : "planned", revision: inspection.revision,
    target: receipt?.target, slot: inspection.slot,
    changes: inspection.changes, nativeToolSelection: inspection.nativeToolSelection,
    ...(receipt ? { projectionName: receipt.projectionName } : {}),
  };
}

/** Read-only. Returned revision binds all effective composition sources and explicit launch inputs. */
async function planMigration(input) {
  const options = normalizeOptions(input);
  const sdk = await loadColdProfileSdk(options.installAnchor);
  const receipt = activeReceipt(options);
  const inspection = await inspectColdComposition(options, sdk, { receipt });
  return { ...summary(inspection, receipt), target: options.target };
}

async function safeOperation(operation) {
  try { return await operation(); } catch (error) {
    if (error instanceof ColdProfileMigrationError) throw error;
    throw new ColdProfileMigrationError("SOURCE_OR_IO_FAILURE");
  }
}

export const planColdProfileMigration = input => safeOperation(() => planMigration(input));

async function exclusiveFile(filename, text) {
  const file = await open(filename, "wx", 0o600);
  try {
    await file.writeFile(text);
    await file.sync();
  } finally {
    await file.close();
  }
}

function requireRevision(inspection, expectedRevision) {
  if (typeof expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(expectedRevision)) refuse("EXPECTED_REVISION_REQUIRED");
  if (inspection.revision !== expectedRevision) refuse("SOURCE_CONFLICT");
}

async function prepareProjection(options, sdk, inspection) {
  const projectionName = `${PROJECTION_PREFIX}${randomUUID()}`;
  const dir = projectionDir(options, projectionName);
  const patch = sdk.yaml.dump(inspection.projected, { schema: sdk.include.entryListSchema, noRefs: true, lineWidth: -1 });
  const packageText = JSON.stringify({
    name: projectionName, version: "1.0.0", private: true,
    dsh: { bundle: { patch: "./cordis.patch.yml" } },
  }, null, 2) + "\n";
  const newText = replaceBundleToken(inspection.manifestText, inspection.slot, projectionName);
  const transaction = {
    version: 1, projectionName, profileDir: options.profileDir, target: options.target,
    home: options.home, installAnchor: options.installAnchor, migrateShell: options.migrateShell, migrateSubagent: options.migrateSubagent,
    migrateSessionPersistence: options.migrateSessionPersistence,
    slot: inspection.slot, originalLiteral: bundleToken(inspection.manifestText, inspection.slot).literal,
    sourceRevision: inspection.revision,
    beforeHash: digest(inspection.manifestText), afterHash: digest(newText), changes: inspection.changes,
    outputs: [{ name: "package.json", hash: digest(packageText) }, { name: "cordis.patch.yml", hash: digest(patch) }],
  };
  await mkdir(dirname(dir), { recursive: true });
  plainPath(dirname(dir));
  await mkdir(dir);
  try {
    await exclusiveFile(join(dir, "package.json"), packageText);
    await exclusiveFile(join(dir, "cordis.patch.yml"), patch);
    await exclusiveFile(join(dir, RECEIPT), JSON.stringify(transaction, null, 2) + "\n");
    readReceipt(options, projectionName);
    const serialized = sdk.boot.loadOverlayPatches("dsmm-cold-profile", join(dir, "cordis.patch.yml"));
    if (JSON.stringify(serialized) !== JSON.stringify(inspection.projected)) refuse("PROJECTION_ROUNDTRIP_FAILED");
    inspection.readset.assertCurrent();
    return transaction;
  } catch (error) {
    const safe = error instanceof ColdProfileMigrationError ? error : new ColdProfileMigrationError("PREPARATION_FAILED");
    safe.projectionName = projectionName;
    throw safe;
  }
}

async function prepareMigration(input) {
  const options = normalizeOptions(input);
  const sdk = await loadColdProfileSdk(options.installAnchor);
  const manifestPath = join(options.profileDir, "package.json");
  plainPath(`${manifestPath}.lock`, { missing: true });
  return sdk.atomic.withFileLock(manifestPath, async () => {
    const active = activeReceipt(options);
    const inspection = await inspectColdComposition(options, sdk, { receipt: active });
    requireRevision(inspection, input.expectedRevision);
    if (active) return { ...summary(inspection, active), target: options.target };
    const receipt = await prepareProjection(options, sdk, inspection);
    return { status: "prepared", projectionName: receipt.projectionName, revision: inspection.revision, nativeToolSelection: inspection.nativeToolSelection };
  });
}

/** Prepare immutable, unreferenced outputs; interruption cannot affect the current boot composition. */
export const prepareColdProfileMigration = input => safeOperation(() => prepareMigration(input));

async function applyMigration(input) {
  const options = normalizeOptions(input);
  if (input.sourceWriteExclusion !== true) refuse("COLD_SOURCE_WRITE_EXCLUSION_REQUIRED");
  const sdk = await loadColdProfileSdk(options.installAnchor);
  const manifestPath = join(options.profileDir, "package.json");
  plainPath(`${manifestPath}.lock`, { missing: true });
  return sdk.atomic.withFileLock(manifestPath, async () => {
    const receipt = activeReceipt(options);
    const inspection = await inspectColdComposition(options, sdk, { receipt });
    requireRevision(inspection, input.expectedRevision);
    if (receipt) return { ...summary(inspection, receipt), target: options.target };
    const transaction = input.projectionName ? readReceipt(options, input.projectionName) : await prepareProjection(options, sdk, inspection);
    if (transaction.sourceRevision !== inspection.revision || transaction.beforeHash !== digest(inspection.manifestText)) refuse("SOURCE_CONFLICT");
    const projectionName = transaction.projectionName;
    const newText = replaceBundleToken(inspection.manifestText, inspection.slot, projectionName);
    if (digest(newText) !== transaction.afterHash) refuse("INVALID_RECEIPT");
    const current = await inspectColdComposition(options, sdk);
    requireRevision(current, input.expectedRevision);
    inspection.readset.assertCurrent();
    readReceipt(options, projectionName);
    if (resolve(sdk.boot.resolveBundleDir("dsmm-cold-profile", projectionName, options.installAnchor, options.profileDir)) !== projectionDir(options, projectionName)) refuse("PROJECTION_RESOLUTION_CONFLICT");
    plainPath(manifestPath);
    await sdk.atomic.writeFileAtomic(manifestPath, newText, { mode: lstatSync(manifestPath).mode & 0o777 });
    return { status: "applied", target: options.target, projectionName, previousRevision: inspection.revision, nativeToolSelection: inspection.nativeToolSelection };
  });
}

/**
 * Requires cold-source write exclusion. Manual editors and non-locking SDK HMR
 * writers must be quiescent across final CAS/rename; the SDK manifest lock
 * coordinates cooperating installers. Conditional rename against arbitrary
 * editors is not a filesystem capability.
 */
export const applyColdProfileMigration = input => safeOperation(() => applyMigration(input));

/**
 * Inspect an exact transaction's recoverability. No directory scan and no profile backup.
 * A prepared, unreferenced package is safe to leave in place and can be retired explicitly.
 */
async function planRecovery(input) {
  const options = normalizeOptions(input);
  const sdk = await loadColdProfileSdk(options.installAnchor);
  const receipt = readReceipt(options, input.projectionName);
  const text = readFileSync(plainPath(join(options.profileDir, "package.json")), "utf8");
  const hash = digest(text);
  if (hash !== receipt.beforeHash && hash !== receipt.afterHash) refuse("RECOVERY_CONFLICT");
  const applied = hash === receipt.afterHash;
  if (applied && JSON.parse(bundleToken(text, receipt.slot).literal) !== receipt.projectionName) refuse("RECOVERY_CONFLICT");
  const inspection = await inspectColdComposition(options, sdk, { receipt: applied ? receipt : undefined });
  return { status: applied ? "rollback-planned" : "unreferenced", revision: inspection.revision, projectionName: receipt.projectionName };
}

export const planColdProfileRecovery = input => safeOperation(() => planRecovery(input));

/** Restore only the original reference token, and only against the current expected source revision. */
async function recoverMigration(input) {
  const options = normalizeOptions(input);
  if (input.sourceWriteExclusion !== true) refuse("COLD_SOURCE_WRITE_EXCLUSION_REQUIRED");
  const sdk = await loadColdProfileSdk(options.installAnchor);
  const manifestPath = join(options.profileDir, "package.json");
  plainPath(`${manifestPath}.lock`, { missing: true });
  return sdk.atomic.withFileLock(manifestPath, async () => {
    const recovery = await planColdProfileRecovery(input);
    if (recovery.revision !== input.expectedRevision) refuse("SOURCE_CONFLICT");
    const receipt = readReceipt(options, input.projectionName);
    const text = readFileSync(manifestPath, "utf8");
    if (recovery.status === "rollback-planned") {
      if (digest(text) !== receipt.afterHash) refuse("RECOVERY_CONFLICT");
      const token = bundleToken(text, receipt.slot);
      const original = text.slice(0, token.offset) + receipt.originalLiteral + text.slice(token.offset + token.length);
      if (digest(original) !== receipt.beforeHash) refuse("RECOVERY_CONFLICT");
      const inspection = await inspectColdComposition(options, sdk, { receipt });
      requireRevision(inspection, input.expectedRevision);
      inspection.readset.assertCurrent();
      await sdk.atomic.writeFileAtomic(manifestPath, original, { mode: lstatSync(manifestPath).mode & 0o777 });
    }
    // Keep immutable outputs and receipt for idempotent recovery; they are no longer referenced.
    return { status: "recovered", projectionName: receipt.projectionName };
  });
}

export const recoverColdProfileMigration = input => safeOperation(() => recoverMigration(input));

export async function coldProfileMigrationCli(argv) {
  const [command, ...args] = argv;
  const values = {};
  const overlays = [];
  const sourceRoots = [];
  const flags = new Set(["--no-shell", "--migrate-subagent", "--migrate-session-persistence", "--source-write-exclusion"]);
  const names = {
    "--profile-dir": "profileDir", "--install-anchor": "installAnchor", "--home": "home",
    "--target": "target", "--expected-revision": "expectedRevision", "--projection-name": "projectionName",
    "--root-config": "rootConfig",
  };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flags.has(flag)) {
      if (Object.hasOwn(values, flag)) refuse("INVALID_ARGUMENTS");
      values[flag] = true;
    } else if (flag === "--patch" || flag === "--source-root" || Object.hasOwn(names, flag)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) refuse("INVALID_ARGUMENTS");
      if (flag === "--patch") overlays.push(value);
      else if (flag === "--source-root") sourceRoots.push(value);
      else {
        if (Object.hasOwn(values, names[flag])) refuse("INVALID_ARGUMENTS");
        values[names[flag]] = value;
      }
    } else refuse("INVALID_ARGUMENTS");
  }
  const input = {
    ...values, overlays, migrateShell: !values["--no-shell"], migrateSubagent: !!values["--migrate-subagent"],
    migrateSessionPersistence: !!values["--migrate-session-persistence"], sourceWriteExclusion: !!values["--source-write-exclusion"],
  };
  if (sourceRoots.length) input.sourceRoots = sourceRoots;
  const commands = {
    plan: planColdProfileMigration, prepare: prepareColdProfileMigration, apply: applyColdProfileMigration,
    "plan-recover": planColdProfileRecovery, recover: recoverColdProfileMigration,
  };
  if (!Object.hasOwn(commands, command)) refuse("INVALID_COMMAND");
  return commands[command](input);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await coldProfileMigrationCli(process.argv.slice(2))));
  } catch (error) {
    // SDK/YAML/filesystem diagnostics can contain configuration values: never echo them.
    console.error(JSON.stringify({ status: "refused", code: error instanceof ColdProfileMigrationError ? error.code : "SOURCE_OR_IO_FAILURE", ...(error.projectionName ? { projectionName: error.projectionName } : {}) }));
    process.exitCode = 1;
  }
}
