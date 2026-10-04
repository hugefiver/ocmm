import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { isDeepStrictEqual } from "node:util";

export const DSH_VERSION = "0.2.0-rc.2";
export const DSMM_VERSION = "0.1.1";
export const SOURCE_FILES = Object.freeze({
  opencode: "C:/Users/hugefiver/.config/opencode/opencode.json",
  ocmm: "C:/Users/hugefiver/.config/opencode/ocmm.jsonc"
});
export const KEY_REFS = Object.freeze({ hoo: "DSMM_HOO_API_KEY", apai: "DSMM_APAI_API_KEY" });
const roles = ["orchestrator", "planner", "plan-critic", "builder", "reviewer", "oracle", "oracle-2nd", "creative", "code-search", "doc-search", "clarifier", "media-reader"];
const efforts = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export class MigrationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => { throw new MigrationError(code); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value) => typeof value === "string" && /^[\w][\w./:-]{0,159}$/u.test(value);
const copy = (value) => structuredClone(value);

export function resolveSourceValue(value, env = process.env) {
  if (typeof value !== "string" || !value.trim()) fail("SOURCE_VALUE_MISSING");
  const ref = /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/u.exec(value);
  if (ref) {
    if (typeof env[ref[1]] !== "string" || !env[ref[1]].trim()) fail("SOURCE_ENV_MISSING");
    return env[ref[1]];
  }
  if (value.includes("{env:") || value.includes("${")) fail("SOURCE_REFERENCE_UNSUPPORTED");
  return value;
}

export function normalizeGatewayBaseURL(provider, value) {
  let url;
  try { url = new URL(value); } catch { fail("SOURCE_ENDPOINT_INVALID"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail("SOURCE_ENDPOINT_UNSUPPORTED");
  const base = value.replace(/\/+$/u, "");
  if (provider === "apai") return base;
  if (provider !== "hoo" || !url.pathname.replace(/\/+$/u, "").endsWith("/v1")) fail("HOO_ENDPOINT_REQUIRES_TERMINAL_V1");
  const normalized = base.slice(0, -3);
  const sourceRequest = new URL(`${base}/messages`);
  const nativeRequest = new URL(`${normalized}/v1/messages`);
  if (sourceRequest.origin !== nativeRequest.origin || sourceRequest.pathname !== nativeRequest.pathname) fail("HOO_ENDPOINT_NOT_EQUIVALENT");
  return normalized;
}

function modelEfforts(provider, model) {
  const result = {};
  const wireFor = (options) => provider === "hoo" ? options?.effort : options?.reasoningEffort;
  if (provider === "hoo" && model.options?.reasoningEffort !== undefined && model.options?.effort === undefined) fail("SOURCE_ANTHROPIC_EFFORT_UNPROVEN");
  const defaultWire = wireFor(model.options);
  if (defaultWire !== undefined) {
    if (!efforts.has(defaultWire)) fail("SOURCE_REASONING_UNSUPPORTED");
    if (model.variants?.[defaultWire]?.disabled === true) fail("SOURCE_DEFAULT_EFFORT_DISABLED");
    result[defaultWire] = defaultWire;
  }
  for (const [level, variant] of Object.entries(model.variants ?? {})) {
    if (variant.disabled === true) continue;
    const wire = wireFor(variant);
    if (!efforts.has(level) || typeof wire !== "string" || !wire.trim()) fail("SOURCE_VARIANT_UNSUPPORTED");
    if (provider === "hoo" && variant.effort !== undefined && variant.reasoningEffort !== undefined && variant.effort !== variant.reasoningEffort) fail("SOURCE_EFFORT_CONFLICT");
    result[level] = wire;
  }
  if (provider === "hoo" && Object.keys(result).length && model.options?.thinking?.type !== "adaptive") fail("SOURCE_THINKING_NOT_ADAPTIVE");
  return Object.keys(result).length ? result : undefined;
}

export function convertProviderConfig(provider, source, { env = process.env, modelIds } = {}) {
  if (!object(source) || source.npm !== (provider === "hoo" ? "@ai-sdk/anthropic" : provider === "apai" ? "@ai-sdk/openai" : undefined)) fail("SOURCE_PROVIDER_PROTOCOL_MISMATCH");
  const profile = {
    api: provider === "hoo" ? "anthropic-messages" : "openai-responses",
    baseURL: normalizeGatewayBaseURL(provider, resolveSourceValue(source.options?.baseURL, env)),
    apiKeyEnv: KEY_REFS[provider],
    ...(provider === "hoo" ? { compat: { forceAdaptiveThinking: true } } : {}),
    models: []
  };
  for (const [id, model] of Object.entries(source.models ?? {})) {
    if (modelIds !== undefined && !modelIds.includes(id)) continue;
    if (!identifier(id) || !object(model) || (model.id !== undefined && model.id !== id)) fail("SOURCE_MODEL_ID_UNSUPPORTED");
    const input = model.modalities?.input ?? ["text"];
    if (!Array.isArray(input) || !input.includes("text") || input.some((mode) => !["text", "image"].includes(mode))) fail("SOURCE_MODALITY_UNSUPPORTED");
    const entry = { id, input: [...new Set(input)] };
    if (model.name !== undefined) entry.name = String(model.name);
    for (const [sourceField, nativeField] of [["context", "contextWindow"], ["output", "maxTokens"]]) {
      const value = model.limit?.[sourceField];
      if (value !== undefined) {
        if (!Number.isSafeInteger(value) || value <= 0) fail("SOURCE_CAPACITY_INVALID");
        entry[nativeField] = value;
      }
    }
    const reasoningEfforts = modelEfforts(provider, model);
    if (reasoningEfforts) entry.reasoningEfforts = reasoningEfforts;
    profile.models.push(entry);
  }
  if (!profile.models.length) fail("SOURCE_PROVIDER_MODELS_MISSING");
  return profile;
}

function splitRoute(model, variant) {
  if (typeof model !== "string" || !model.includes("/")) fail("SOURCE_ROUTE_INCOMPLETE");
  const slash = model.indexOf("/");
  const provider = model.slice(0, slash);
  const id = model.slice(slash + 1);
  if (!Object.hasOwn(KEY_REFS, provider) || !identifier(id)) fail("SOURCE_ROUTE_UNSUPPORTED");
  if (variant !== undefined && !efforts.has(variant)) fail("SOURCE_ROLE_EFFORT_UNSUPPORTED");
  return { provider, model: id, ...(variant === undefined ? {} : { reasoningEffort: variant }) };
}

function fallbackRoutes(entries) {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) fail("SOURCE_FALLBACK_INVALID");
  const result = [];
  for (const entry of entries) {
    if (typeof entry === "string") { result.push(splitRoute(entry)); continue; }
    if (!object(entry) || !identifier(entry.model) || !Array.isArray(entry.providers) || !entry.providers.length) fail("SOURCE_FALLBACK_INVALID");
    if (entry.variant !== undefined && entry.reasoningEffort !== undefined && entry.variant !== entry.reasoningEffort) fail("SOURCE_FALLBACK_EFFORT_CONFLICT");
    for (const provider of entry.providers) result.push(splitRoute(`${provider}/${entry.model}`, entry.reasoningEffort ?? entry.variant));
  }
  const seen = new Map();
  return result.filter((route) => {
    const key = `${route.provider}/${route.model}`;
    if (seen.has(key)) {
      if (seen.get(key) !== route.reasoningEffort) fail("SOURCE_FALLBACK_DUPLICATE_EFFORT");
      return false;
    }
    seen.set(key, route.reasoningEffort);
    return true;
  });
}

export function convertRoleRouting(source) {
  if (!object(source?.agents)) fail("SOURCE_ROLES_MISSING");
  const roleRouting = {};
  const enabled = {};
  for (const role of roles) {
    let agent = source.agents[role];
    if (role === "code-search") {
      const alias = source.agents.explore;
      if (!agent?.model && alias?.model) agent = alias;
      else if (alias?.model && !isDeepStrictEqual(splitRoute(alias.model, alias.variant), splitRoute(agent.model, agent.variant))) fail("SOURCE_EXPLORE_ALIAS_CONFLICT");
    }
    if (typeof agent?.disabled === "boolean") enabled[`dsmm-${role}`] = !agent.disabled;
    if (!agent?.model) continue;
    if (agent.reasoningEffort !== undefined && agent.variant !== undefined && agent.reasoningEffort !== agent.variant) fail("SOURCE_ROLE_EFFORT_CONFLICT");
    roleRouting[`dsmm-${role}`] = {
      primary: splitRoute(agent.model, agent.reasoningEffort ?? agent.variant),
      fallbackRoutes: fallbackRoutes(agent.fallbackModels)
    };
  }
  return { roleRouting, roles: enabled };
}

export function buildMigrationCandidate(opencode, ocmm, { env = process.env, modelEvidence = {} } = {}) {
  const providers = {};
  const secrets = {};
  const routing = convertRoleRouting(ocmm);
  const hooIds = [...new Set(Object.values(routing.roleRouting).flatMap((policy) => [policy.primary, ...policy.fallbackRoutes]).filter((route) => route.provider === "hoo").map((route) => route.model))];
  const omittedModels = { hoo: Object.keys(opencode.provider?.hoo?.models ?? {}).filter((id) => !hooIds.includes(id)) };
  for (const provider of Object.keys(KEY_REFS)) {
    providers[provider] = convertProviderConfig(provider, opencode.provider?.[provider], { env, ...(provider === "hoo" ? { modelIds: hooIds } : {}) });
    secrets[KEY_REFS[provider]] = resolveSourceValue(opencode.provider[provider].options?.apiKey, env);
  }
  const unresolved = [];
  for (const [role, policy] of Object.entries(routing.roleRouting)) for (const route of [policy.primary, ...policy.fallbackRoutes]) {
    const profile = providers[route.provider];
    let model = profile.models.find((item) => item.id === route.model);
    if (!model) {
      const evidence = modelEvidence[`${route.provider}/${route.model}`];
      if (route.provider === "hoo" && route.model === "doubao-seed-2.1-turbo" && evidence?.imageAccepted === true && Array.isArray(evidence.input) && evidence.input.includes("image")) {
        model = { id: route.model, input: copy(evidence.input) };
        if (model.input.some((mode) => !["text", "image"].includes(mode)) || !model.input.includes("text")) fail("MEDIA_EVIDENCE_INVALID");
        for (const field of ["contextWindow", "maxTokens"]) if (evidence[field] !== undefined) {
          if (!Number.isSafeInteger(evidence[field]) || evidence[field] <= 0) fail("MEDIA_EVIDENCE_INVALID");
          model[field] = evidence[field];
        }
        profile.models.push(model);
      } else { unresolved.push({ role, provider: route.provider, model: route.model, reason: "MODEL_CAPABILITY_EVIDENCE_REQUIRED" }); continue; }
    }
    if (route.reasoningEffort !== undefined && !Object.hasOwn(model.reasoningEfforts ?? {}, route.reasoningEffort)) fail("ROLE_EFFORT_NOT_DECLARED");
  }
  return {
    providers, secrets, unresolved, omittedModels,
    settings: { defaultActive: true, workflow: { policy: "risk-based" }, roles: routing.roles, roleRouting: routing.roleRouting,
      runtimeRecovery: { enabled: true, retryOnCodes: ["RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT"], fallbackRoutes: [], idleContinuation: { enabled: false } } }
  };
}

export function migrationSummary(candidate) {
  return {
    providers: Object.fromEntries(Object.entries(candidate.providers).map(([provider, profile]) => [provider, {
      api: profile.api, credentialRef: profile.apiKeyEnv,
      models: profile.models.map(({ id, input, contextWindow, maxTokens, reasoningEfforts }) => ({ id, input, contextWindow, maxTokens, efforts: Object.keys(reasoningEfforts ?? {}) }))
    }])),
    roleRouting: copy(candidate.settings.roleRouting), roles: copy(candidate.settings.roles), runtimeRecovery: copy(candidate.settings.runtimeRecovery), unresolved: copy(candidate.unresolved),
    omittedUnusedHooModels: { count: candidate.omittedModels.hoo.length, ids: [...candidate.omittedModels.hoo] }
  };
}

export function modelEvidenceFromReceipt(receipt, sourceHashes) {
  if (receipt?.outcome !== "COMPLETED" || receipt.kind !== "REAL_GATEWAY_MEDIA_IMAGE" || receipt.dshVersion !== DSH_VERSION || receipt.provider !== "hoo" || receipt.model !== "doubao-seed-2.1-turbo" || receipt.protocol !== "anthropic-messages" || receipt.imageAccepted !== true || receipt.answerMatches !== true || receipt.paidCalls !== 1 || !(receipt.usage?.inputTokens > 0 && receipt.usage?.outputTokens > 0)) fail("MEDIA_RECEIPT_INVALID");
  if (receipt.sourceHashes?.opencode !== sourceHashes.opencode || receipt.sourceHashes?.ocmm !== sourceHashes.ocmm) fail("MEDIA_RECEIPT_SOURCE_MISMATCH");
  if (!object(receipt.modelEvidence?.["hoo/doubao-seed-2.1-turbo"])) fail("MEDIA_RECEIPT_DECLARATION_MISSING");
  return copy(receipt.modelEvidence);
}

function findRows(patch, id) {
  const result = [];
  const visit = (rows) => { for (const row of rows) {
    if (!object(row)) fail("PATCH_ROW_INVALID");
    if (row.id === id) result.push(row);
    if (Array.isArray(row.insert)) visit(row.insert);
  } };
  visit(patch);
  return result;
}

export function mergeMigrationPatch(existingPatch, candidate) {
  if (!Array.isArray(existingPatch) || candidate.unresolved.length) fail("MIGRATION_UNRESOLVED");
  const patch = copy(existingPatch);
  const upsert = (id, update) => {
    const matches = findRows(patch, id);
    if (matches.length > 1) fail("PATCH_DUPLICATE_TARGET");
    const row = matches[0] ?? { id };
    if (!matches.length) patch.push(row);
    row.config = update(row.config ?? {});
  };
  upsert("dsmm", (config) => ({ ...config, ...copy(candidate.settings), roles: { ...config.roles, ...candidate.settings.roles }, workflow: { ...config.workflow, ...candidate.settings.workflow },
    roleRouting: { ...config.roleRouting, ...copy(candidate.settings.roleRouting) }, runtimeRecovery: { ...config.runtimeRecovery, ...copy(candidate.settings.runtimeRecovery), idleContinuation: { ...config.runtimeRecovery?.idleContinuation, enabled: false } } }));
  upsert("llm-pi-ai", (config) => ({ ...config, providers: { ...config.providers, ...copy(candidate.providers) } }));
  return patch;
}

export async function applyCredentialRefs(credentials, credentialRefFactory, secrets) {
  const checks = [];
  for (const [name, value] of Object.entries(secrets)) {
    if (!Object.values(KEY_REFS).includes(name) || typeof value !== "string" || !value.trim()) fail("CREDENTIAL_INPUT_INVALID");
    const ref = credentialRefFactory(name);
    const info = await credentials.describe(ref);
    const current = await credentials.resolve(ref);
    if (info.configured && current?.value !== value) fail("EXISTING_CREDENTIAL_DIFFERS");
    if (!info.configured && !info.writable) fail("CREDENTIAL_NOT_WRITABLE");
    checks.push({ name, ref, value, create: !info.configured });
  }
  const created = [];
  try {
    for (const item of checks) {
      if (item.create) {
        if ((await credentials.describe(item.ref)).configured) fail("CREDENTIAL_CHANGED_CONCURRENTLY");
        await credentials.set(item.ref, item.value);
        created.push(item.name);
      }
      if ((await credentials.resolve(item.ref))?.value !== item.value) fail("CREDENTIAL_WRITE_NOT_EFFECTIVE");
    }
  } catch (error) {
    const safe = error instanceof MigrationError ? error : new MigrationError("CREDENTIAL_WRITE_FAILED");
    safe.createdCredentialRefs = [...created];
    throw safe;
  }
  return { created, reused: checks.filter((item) => !item.create).map((item) => item.name) };
}

export async function readSourceConfigs() {
  const parser = await import(new URL("../../dist/config/load.js", import.meta.url));
  const values = {};
  const hashes = {};
  for (const [name, filename] of Object.entries(SOURCE_FILES)) {
    let raw;
    try { raw = readFileSync(filename); values[name] = JSON.parse(parser.stripJsoncCommentsAndTrailingCommas(raw.toString("utf8"))); }
    catch { fail("SOURCE_CONFIG_UNREADABLE"); }
    hashes[name] = sha256(raw);
  }
  return { ...values, hashes };
}

async function runtimeModules(runtime) {
  const req = createRequire(join(resolve(runtime), "package.json"));
  if (JSON.parse(readFileSync(req.resolve("@deepseek-ai/dsh/package.json"), "utf8")).version !== DSH_VERSION) fail("DSH_VERSION_MISMATCH");
  const load = (name) => import(pathToFileURL(req.resolve(name)).href);
  const [cordis, llm, pi, credentials, local, atomic] = await Promise.all(["@deepseek-ai/cordis", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-credentials", "@deepseek-ai/dsh-credentials-local", "@deepseek-ai/dsh-atomic-write"].map(load));
  return { req, cordis, llm, pi, credentials, local, atomic };
}

export async function validateNativeCandidate(candidate, runtime) {
  if (candidate.unresolved.length) fail("MIGRATION_UNRESOLVED");
  const modules = await runtimeModules(runtime);
  const ctx = new modules.cordis.Context();
  try {
    await ctx.plugin(modules.llm.LlmRuntime, {}).await();
    await ctx.plugin(modules.pi, { providers: candidate.providers }).await();
    for (const [provider, profile] of Object.entries(candidate.providers)) for (const model of profile.models) await ctx.llm.resolveModelInfo(provider, model.id);
    for (const policy of Object.values(candidate.settings.roleRouting)) for (const route of [policy.primary, ...policy.fallbackRoutes]) {
      const info = await ctx.llm.resolveModelInfo(route.provider, route.model);
      if (route.reasoningEffort !== undefined && !info.reasoning?.efforts.some((item) => item.id === route.reasoningEffort)) fail("NATIVE_EFFORT_UNSUPPORTED");
    }
    return true;
  } finally { await ctx.fiber.dispose(); }
}

async function applyCandidate(candidate, options) {
  if (!options.runtime || !options["dsh-home"] || options.profile !== "desktop" || !options["expected-patch-sha256"] || !options["expected-manifest-sha256"] || !options["patch-backup"] || !options["manifest-backup"] || !options["desktop-fully-quit"]) fail("APPLY_SAFETY_INPUTS_REQUIRED");
  if (!isAbsolute(options["dsh-home"])) fail("DSH_HOME_MUST_BE_ABSOLUTE");
  const home = realpathSync(options["dsh-home"]);
  const profileDir = realpathSync(join(home, "profiles", "desktop"));
  if (relative(home, profileDir).startsWith("..")) fail("PROFILE_PATH_ESCAPES_HOME");
  const patchPath = join(profileDir, "cordis.patch.yml");
  const manifestPath = join(profileDir, "package.json");
  const patchBytes = readFileSync(patchPath);
  const manifestBytes = readFileSync(manifestPath);
  for (const [bytes, expected, backup, target] of [[patchBytes, options["expected-patch-sha256"], options["patch-backup"], patchPath], [manifestBytes, options["expected-manifest-sha256"], options["manifest-backup"], manifestPath]]) {
    if (!/^[a-f0-9]{64}$/u.test(expected) || sha256(bytes) !== expected || resolve(backup) === target || sha256(readFileSync(backup)) !== expected) fail("PRIOR_HASH_OR_BACKUP_MISMATCH");
  }
  const profileRequire = createRequire(manifestPath);
  const installed = JSON.parse(readFileSync(profileRequire.resolve("@dsmm/dsmm/package.json"), "utf8"));
  if (installed.name !== "@dsmm/dsmm" || installed.version !== DSMM_VERSION) fail("INSTALLED_DSMM_VERSION_MISMATCH");
  profileRequire.resolve("@dsmm/dsmm");
  profileRequire.resolve("@dsmm/dsmm/preset-skills");
  const dsmm = await import(pathToFileURL(join(dirname(profileRequire.resolve("@dsmm/dsmm/package.json")), "lib", "settings.js")).href);
  dsmm.resolveConfig(dsmm.DSMM_CONFIG_SCHEMA(candidate.settings));
  await validateNativeCandidate(candidate, options.runtime);
  const modules = await runtimeModules(options.runtime);
  const yaml = modules.req("yaml");
  const document = yaml.parseDocument(patchBytes.toString("utf8"));
  if (document.errors.length) fail("PATCH_DOCUMENT_INVALID");
  const merged = mergeMigrationPatch(document.toJS(), candidate);
  // Updating only target nodes retains unrelated YAML rows and their comments.
  for (const id of ["dsmm", "llm-pi-ai"]) {
    const indexes = [];
    const scan = (rows, path = []) => { rows.forEach((row, index) => {
      if (row.id === id) indexes.push([...path, index]);
      if (Array.isArray(row.insert)) scan(row.insert, [...path, index, "insert"]);
    }); };
    scan(document.toJS());
    const row = findRows(merged, id)[0];
    if (indexes.length) document.setIn([...indexes[0], "config"], row.config);
    else document.add(row);
  }
  const ctx = new modules.cordis.Context();
  const credentialsPath = join(home, ".credentials.yaml");
  const snapshot = () => existsSync(credentialsPath) ? modules.local.parseCredentialsDocument(readFileSync(credentialsPath, "utf8"), credentialsPath) : { refs: new Map(), records: new Map() };
  let credentialChanges;
  try {
    const before = snapshot();
    for (const [source, expected] of Object.entries(options.sourceHashes)) if (sha256(readFileSync(SOURCE_FILES[source])) !== expected) fail("SOURCE_CHANGED_CONCURRENTLY");
    await ctx.plugin(modules.local.LocalCredentialProvider, { dshHome: home, watch: false }).await();
    credentialChanges = await applyCredentialRefs(ctx.credentials, modules.credentials.credentialRef, candidate.secrets);
    const after = snapshot();
    if ([...before.refs].some(([key, value]) => !Object.values(KEY_REFS).includes(key) && after.refs.get(key) !== value) || !isDeepStrictEqual(before.records, after.records)) fail("CREDENTIAL_PRESERVATION_CHANGED");
    await modules.atomic.withFileLock(patchPath, async () => {
      if (sha256(readFileSync(patchPath)) !== options["expected-patch-sha256"] || sha256(readFileSync(manifestPath)) !== options["expected-manifest-sha256"]) fail("PROFILE_CHANGED_CONCURRENTLY");
      await modules.atomic.writeFileAtomic(patchPath, document.toString(), { mode: 0o600, dirMode: 0o700 });
    });
    return { credentialChanges, unrelatedCredentialsAndRecordsPreserved: true, manifestUnchanged: sha256(readFileSync(manifestPath)) === options["expected-manifest-sha256"], patchSha256: sha256(readFileSync(patchPath)), validation: "INSTALLED_PURE_SCHEMA_AND_PINNED_RUNTIME_MODEL_METADATA", desktopActivation: "PENDING_AUTHORIZED_HOST_VERIFICATION" };
  } catch (error) {
    const safe = error instanceof MigrationError ? error : new MigrationError("PROFILE_APPLY_FAILED");
    safe.createdCredentialRefs ??= credentialChanges?.created ?? [];
    throw safe;
  } finally { await ctx.fiber.dispose(); }
}

export async function main(args = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({ args, options: { apply: { type: "boolean", default: false }, runtime: { type: "string" }, "dsh-home": { type: "string" }, profile: { type: "string" }, "model-evidence": { type: "string" }, "expected-patch-sha256": { type: "string" }, "expected-manifest-sha256": { type: "string" }, "patch-backup": { type: "string" }, "manifest-backup": { type: "string" }, "desktop-fully-quit": { type: "boolean" } } });
    const source = await readSourceConfigs();
    const evidence = values["model-evidence"] ? modelEvidenceFromReceipt(JSON.parse(readFileSync(resolve(values["model-evidence"]), "utf8")), source.hashes) : {};
    const candidate = buildMigrationCandidate(source.opencode, source.ocmm, { modelEvidence: evidence });
    const report = { outcome: values.apply ? "APPLIED" : "DRY_RUN", dshVersion: DSH_VERSION, packageVersion: DSMM_VERSION, sourceHashes: source.hashes, ...migrationSummary(candidate) };
    if (values.apply) Object.assign(report, await applyCandidate(candidate, { ...values, sourceHashes: source.hashes }));
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return report;
  } catch (error) {
    const report = { outcome: "FAILED", code: error instanceof MigrationError ? error.code : "MIGRATION_OPERATION_FAILED", ...(error.createdCredentialRefs ? { createdCredentialRefs: error.createdCredentialRefs } : {}) };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = 1;
    return report;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
