import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DSMM_CONFIG_SCHEMA, DSMM_LOCALES, DSMM_NATIVE_CONFIG_SCHEMA, DSMM_SETTINGS_SCHEMA, resolveConfig, resolveDeployment, validateSparseConfig } from "../src/settings.js";
import { DsmmConfigValidationError, diagnostic, diagnosticSourcePath, fieldLocation, inspectJsonDocument } from "../src/profile-diagnostics.js";
import { parseGlobalConfig } from "../src/deployment-config.js";
import { parseProfileDocument, profileErrorInfo, requiredDeepworkRoles, resolveProfileSettings, validateProfileDocument } from "../src/profiles.js";
import { ProfileStore } from "../src/profile-store.js";
import { DsmmProfileRuntime } from "../src/profile-runtime.js";
import { admissionFromChildCapture, parseChildAdmissionCapture, parseLegacyChildEvidence } from "../src/child-capture.js";
import type { ChildAdmissionCaptureV3 } from "../src/child-capture.js";
import { parseChildAdmissionEvidenceView } from "../src/child-evidence.js";
import { parseDsmmInvocationView, parseProfileDiagnostic, parseRoleAvailability, parseSubagentRuntimeAdmissionView, TYPERT_REMOTE } from "../src/profile-remote.js";
import type { DshAgent, DshContext } from "../src/dsh-types.js";
import type { DsmmProfileAdmission } from "../src/settings.js";
import type { DsmmChildAdmissionAuthority, ParentAdmissionTicket } from "../src/child-admission-contract.js";

const raw = (settings: unknown, label?: string) => JSON.stringify({ version: 1, id: "focus", ...(label === undefined ? {} : { label }), settings });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function capture(child = "child/opaque", parent = "parent/opaque", epoch = "a".repeat(64)): ChildAdmissionCaptureV3 {
  const settings = resolveConfig({ locale: "ja", guards: { gitWriteGuard: "deny" }, roleRouting: { "dsmm-reviewer": { levels: { low: { reasoningEffort: "low" } } } } });
  return { version: 3, delegationMode: "continuable", modelParameterPolicy: { mode: "passthrough" }, childSessionId: child, parentSessionId: parent, role: "dsmm-reviewer", profilePin: null, originalAdmissionEpoch: epoch,
    invocation: { level: "low", initialRoute: { provider: "fixture", model: "old-model", reasoningEffort: "low" },
      requestedRoute: { provider: "fixture", model: "old-model", reasoningEffort: "low" }, effortSource: "dsmm-config", routeSource: "level" },
    runtimePolicyCapture: { modules: settings.modules, roleRouting: settings.roleRouting, runtimePolicy: settings.runtimePolicy, workflow: settings.workflow,
      guards: settings.guards, runtimeRecovery: settings.runtimeRecovery, defaultActive: settings.defaultActive, skills: settings.skills,
      deepseekV4ProCalibration: settings.deepseekV4ProCalibration, deepseekV4ProDefaultReasoningEffort: settings.deepseekV4ProDefaultReasoningEffort,
      deepseekFlashCalibration: settings.deepseekFlashCalibration, deepseekFlashDefaultReasoningEffort: settings.deepseekFlashDefaultReasoningEffort,
      subagents: { enableRunInBackground: false, backgroundMode: "one-shot" } },
    authorityCeiling: { roles: ["dsmm-reviewer"], readOnly: true, toolFilter: { allow: ["read"] }, allowRouteOverride: false, maxDepth: 1 }, locale: "ja", toolTopology: "per-role" };
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "dsmm-wave1-"));
  return { directory, store: new ProfileStore(join(directory, "dsmm-profiles")), cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test("levels use a strict effort/complete-route union; normal is not a configurable level and root stays native-owned", () => {
  const input = { roleRouting: { "dsmm-reviewer": { levels: { low: { reasoningEffort: "low" }, high: { provider: "fixture", model: "high-model" }, max: { provider: "fixture", model: "max-model", reasoningEffort: "xhigh" } } } } };
  assert.deepEqual(resolveConfig(DSMM_CONFIG_SCHEMA(input)).roleRouting, input.roleRouting);
  const native = DSMM_NATIVE_CONFIG_SCHEMA(input).roleRouting as unknown as { get(): unknown };
  assert.deepEqual(native.get(), input.roleRouting, "native transport uses public volatile refs, not resolved settings");
  for (const levels of [{ normal: { reasoningEffort: "high" } }, { low: {} }, { low: { provider: "p" } }, { low: { model: "m" } }, { low: { reasoningEffort: "" } }, { max: { provider: "p", model: "m", apiKey: "unsafe" } }]) {
    assert.throws(() => validateSparseConfig({ roleRouting: { "dsmm-reviewer": { levels } } }));
    assert.throws(() => parseProfileDocument(raw({ roleRouting: { "dsmm-reviewer": { levels } } })));
  }
  assert.throws(() => resolveConfig({ roleRouting: { "dsmm-orchestrator": { levels: { low: { reasoningEffort: "low" } } } } }), DsmmConfigValidationError);
  const merged = resolveDeployment({ roleRouting: { "dsmm-reviewer": { levels: { high: { provider: "old", model: "old", reasoningEffort: "max" } } } } }, { roleRouting: { "dsmm-reviewer": { levels: { high: { reasoningEffort: "low" } } } } });
  assert.deepEqual(merged.roleRouting["dsmm-reviewer"]?.levels?.high, { reasoningEffort: "low" });
});

test("locale allowlist has no default, alias or implicit normalization; override permission is deployment-only", () => {
  assert.equal(Object.hasOwn(resolveConfig(), "locale"), false);
  for (const locale of DSMM_LOCALES) assert.equal(resolveProfileSettings({ locale: "en" }, { locale }).locale, locale);
  assert.equal(resolveProfileSettings({ locale: "fr" }, {}).locale, "fr");
  for (const locale of ["zh", "auto", "", null, "en-US"]) {
    const result = validateProfileDocument(raw({ locale }));
    assert.equal(result.diagnostics[0]?.code, "unsupported-value");
    assert.equal(result.diagnostics[0]?.field, "settings.locale");
    assert.throws(() => validateSparseConfig({ locale }));
  }
  assert.equal(resolveConfig().subagents.toolTopology, "per-role");
  assert.equal(resolveConfig().subagents.allowRouteOverride, false);
  assert.equal(resolveProfileSettings({ subagents: { allowRouteOverride: true } }, { subagents: { toolTopology: "parameterized" } }).subagents.allowRouteOverride, true);
  for (const key of ["allowRouteOverride", "maxDepth", "enableRunInBackground", "backgroundMode"]) assert.throws(() => parseProfileDocument(raw({ subagents: { [key]: true } })));
});

test("both deprecated fields are refused with the exact safe field through every config parser", () => {
  for (const field of ["deepseekV4ProMaxReasoningPresets", "deepseekFlashMaxReasoningPresets"]) {
    for (const parse of [resolveConfig, validateSparseConfig, DSMM_CONFIG_SCHEMA, DSMM_NATIVE_CONFIG_SCHEMA, DSMM_SETTINGS_SCHEMA]) {
      assert.throws(() => parse({ [field]: [] } as never), (error: unknown) => error instanceof DsmmConfigValidationError && error.diagnostic.code === "deprecated-field" && error.diagnostic.field === field);
    }
    const json = JSON.stringify({ [field]: [] });
    try { parseGlobalConfig(json); assert.fail("must refuse"); } catch (error) {
      const info = profileErrorInfo(error); assert.equal(info.reason, "deprecated-field"); assert.equal(info.field, field); assert.equal(json.slice(info.location!.offset, info.location!.offset + info.location!.length), JSON.stringify(field));
    }
    const result = validateProfileDocument(raw({ [field]: [] }));
    assert.equal(result.diagnostics[0]?.field, `settings.${field}`); assert.equal(result.diagnostics[0]?.code, "deprecated-field");
  }
});

test("required roles are independent of root exposure; named true cannot bypass captured module/role ceilings", () => {
  assert.deepEqual(requiredDeepworkRoles(resolveConfig()), ["dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic"]);
  assert.deepEqual(requiredDeepworkRoles(resolveConfig({ workflow: { policy: "legacy", finalReviewPolicy: "reviewer-only" } })), ["dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic", "dsmm-reviewer"]);
  assert.deepEqual(requiredDeepworkRoles(resolveConfig({ workflow: { policy: "legacy", finalReviewPolicy: "simple-oracle-complex-reviewer" } })), ["dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic", "dsmm-reviewer", "dsmm-oracle"]);
  assert.equal(resolveProfileSettings({}, parseProfileDocument(raw({ roles: { "dsmm-reviewer": false, "dsmm-builder": false } })).settings).roles["dsmm-reviewer"], false);
  for (const role of ["dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic"]) assert.equal(validateProfileDocument(raw({ roles: { [role]: false } })).diagnostics[0]?.code, "required-role");
  assert.throws(() => resolveProfileSettings({ roles: { "dsmm-builder": false } }, { roles: { "dsmm-builder": true } }), { reason: "deployment-ceiling", field: "settings.roles.dsmm-builder" });
  assert.throws(() => resolveProfileSettings({ modules: { deepwork: { enabled: false } } }, { roles: { "dsmm-reviewer": true } }), { reason: "deployment-ceiling" });
});

test("JSONC diagnostics preserve exact offsets for BOM, duplicates, nested arrays and secret-bearing unknown keys", () => {
  for (const [json, code, field, token] of [
    ['\uFEFF{\n"version":1,"id":"focus","settings":{"defaultActive":true,"defaultActive":false}}', "duplicate-field", "settings.defaultActive", '"defaultActive":false'],
    [raw({ runtimeRecovery: { retryOnStatusCodes: [429, 99] } }), "invalid-type", "settings.runtimeRecovery.retryOnStatusCodes[1]", "99"],
    [raw({ guards: { questionLabelHelper: { surprise: true } } }), "unknown-field", "settings.guards.questionLabelHelper.[unknown]", '"surprise"'],
    [raw({ "token=PRIVATE/SECRET": "PRIVATE_VALUE" }), "unknown-field", "settings.[unknown]", '"token=PRIVATE/SECRET"']
  ]) {
    const issue = validateProfileDocument(json).diagnostics[0];
    assert.equal(issue.code, code); assert.equal(issue.field, field); assert.ok(issue.location);
    assert.equal(json.slice(issue.location.offset, issue.location.offset + issue.location.length), token.includes(":false") ? '"defaultActive"' : token);
    assert.equal(JSON.stringify(issue).includes("PRIVATE"), false);
    parseProfileDiagnostic(issue);
  }
  assert.equal(validateProfileDocument('{"version":').diagnostics[0]?.code, "invalid-jsonc");
});

test("blank label is the only warning and persists across raw save/list/pinned default/session reopen", async () => {
  const f = fixture();
  try {
    const content = '\uFEFF{ // untouched\n"version":1,"id":"focus","label":"  ","settings":{"locale":"zh-Hant"},}\n';
    const saved = await f.store.save({ id: "focus", content, expectedRevision: null });
    assert.equal(saved.content, content); assert.equal(saved.warnings?.[0]?.code, "blank-label");
    assert.equal((await f.store.read("focus")).warnings?.[0]?.location?.line, 2);
    const selected = await f.store.select({ id: "focus", expectedRevision: saved.revision, expectedSelectionRevision: "absent" });
    assert.equal(selected.selection.warnings?.[0]?.code, "blank-label");
    const session = await f.store.selectSession({ sessionId: "root", id: "focus", expectedRevision: saved.revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: "a".repeat(64) }, "b".repeat(64), () => true, { assertCurrent() {}, committed() {} });
    assert.equal(session.selection.warnings?.[0]?.code, "blank-label");
    const reopened = new ProfileStore(f.store.profileDir);
    assert.equal((await reopened.describe()).profiles[0].error, undefined);
    assert.equal((await reopened.describe()).profiles[0].label, "focus");
    assert.equal((await reopened.describe()).profiles[0].warnings?.[0]?.code, "blank-label");
    assert.equal((await reopened.describe()).selectedWarnings?.[0]?.code, "blank-label");
    assert.equal((await reopened.loadSessionSelection("root")).warnings?.[0]?.code, "blank-label");
    await f.store.save({ id: "focus", content: raw({}, "Nonblank"), expectedRevision: saved.revision });
    assert.equal((await reopened.loadSelection()).warnings?.[0]?.code, "blank-label", "warnings come from admitted immutable revision, not current draft");
    assert.equal(readFileSync(join(f.store.profileDir, ".revisions", `${saved.revision}.jsonc`), "utf8"), content);
    for (const label of [42, "\n", "x".repeat(121), "\uD800"]) assert.throws(() => parseProfileDocument(JSON.stringify({ version: 1, id: "focus", label, settings: {} })));
  } finally { f.cleanup(); }
});

test("strict warning codecs cannot downgrade arbitrary security errors or echo unbounded reasons/fields", () => {
  const codec = TYPERT_REMOTE.descriptors.find(row => row.method === "read")!.result;
  if (codec.mode !== "strict") assert.fail("Expected native strict codec");
  const parser = codec.create().parse;
  const valid = { id: "focus", content: raw({}, ""), revision: "a".repeat(64), warnings: [diagnostic("blank-label", "label")] };
  assert.deepEqual(parser(valid), valid);
  for (const warning of [{ ...diagnostic("unsafe-field", "settings"), severity: "warning" }, { ...diagnostic("blank-label", "label"), reason: "PRIVATE_SECRET" }, { ...diagnostic("blank-label", "label"), field: "token=PRIVATE" }, { ...diagnostic("blank-label", "label"), location: { offset: -1, length: 1, line: 1, column: 1 } }]) assert.throws(() => parser({ ...valid, warnings: [warning] }));
  assert.throws(() => parser({ ...valid, warnings: new Array(1) }));
  let accessed = false;
  const getter = Object.defineProperty({ ...valid }, "label", { enumerable: true, get() { accessed = true; return "PRIVATE_SECRET"; } });
  assert.throws(() => parser(getter)); assert.equal(accessed, false);
});

test("child capture is immutable/create-only, keyed by opaque IDs, strict and never migrated on missing/corrupt data", async () => {
  const f = fixture();
  try {
    const input = capture();
    assert.equal(await f.store.readChildAdmission(input.childSessionId, input.parentSessionId), null);
    const written = await f.store.createChildAdmission(input);
    assert.ok(Object.isFrozen(written.runtimePolicyCapture.guards));
    assert.deepEqual(await new ProfileStore(f.store.profileDir).readChildAdmission(input.childSessionId, input.parentSessionId), written);
    assert.deepEqual(await f.store.createChildAdmission(input), written);
    await assert.rejects(f.store.createChildAdmission({ ...input, toolTopology: "parameterized" }), { code: "conflict" });
    await assert.rejects(f.store.readChildAdmission(input.childSessionId, "foreign-parent"), { code: "corrupt-selection" });
    const path = join(f.store.stateDir, ".children", "v1", `${hash(input.childSessionId)}.json`);
    assert.deepEqual(readdirSync(join(f.store.stateDir, ".children", "v1")), [`${hash(input.childSessionId)}.json`]);
    const bytes = readFileSync(path, "utf8");
    writeFileSync(path, bytes.replace('"gitWriteGuard":"deny"', '"gitWriteGuard":"off"'));
    await assert.rejects(f.store.readChildAdmission(input.childSessionId, input.parentSessionId), { code: "corrupt-selection" });
    writeFileSync(path, bytes);
    linkSync(path, join(f.directory, "hard-link"));
    await assert.rejects(f.store.readChildAdmission(input.childSessionId, input.parentSessionId), { code: "unsafe-path" });
    assert.equal(existsSync(join(f.directory, "child", "opaque")), false);
  } finally { f.cleanup(); }
});

test("capture grammar requires full executable policy but excludes private installation configuration", () => {
  const input = capture();
  for (const changed of [{ ...input, credentials: "private" }, { ...input, runtimePolicyCapture: { ...input.runtimePolicyCapture, lsp: { env: { TOKEN: "private" } } } }, { ...input, authorityCeiling: { ...input.authorityCeiling, readOnly: "true" } }, { ...input, invocation: { ...input.invocation, level: "auto" } }]) assert.throws(() => parseChildAdmissionCapture(changed));
  const incomplete = structuredClone(input);
  Reflect.deleteProperty(incomplete.runtimePolicyCapture.guards, "gitWriteGuard");
  assert.throws(() => parseChildAdmissionCapture(incomplete));
  const admitted = admissionFromChildCapture(input, resolveConfig({ locale: "ru", guards: { gitWriteGuard: "off" }, subagents: { allowRouteOverride: true }, roleRouting: { "dsmm-reviewer": { primary: { provider: "new", model: "new" } } } }));
  assert.equal(admitted.settings.guards.gitWriteGuard, "deny"); assert.equal(admitted.settings.subagents.allowRouteOverride, false);
  assert.equal(admitted.settings.locale, "ja"); assert.equal(admitted.settings.roleRouting["dsmm-reviewer"]?.primary, undefined);
  assert.equal(admitted.epoch, input.originalAdmissionEpoch);
});

test("legacy evidence does not fabricate pin/epoch/level and permits only finite proven/limitation fields", () => {
  const evidence = { version: 1, mode: "legacy-conservative", childSessionId: "child", parentSessionId: "parent", role: "dsmm-reviewer", route: { provider: "fixture", model: "old" }, depth: 1,
    toolFilter: { allow: ["read"] }, provenFields: ["lineage", "role", "route", "tool-filter"], limitations: [{ field: "git-write", code: "missing-evidence", effect: "capability-denied" }] };
  assert.deepEqual(parseLegacyChildEvidence(evidence), evidence);
  assert.throws(() => parseLegacyChildEvidence({ ...evidence, originalAdmissionEpoch: "a".repeat(64) }));
  assert.throws(() => parseLegacyChildEvidence({ ...evidence, provenFields: [...evidence.provenFields, "profile-pin"] }));
  const view = { mode: "legacy-conservative", parentAdmissionEpoch: "b".repeat(64), provenFields: evidence.provenFields, limitations: evidence.limitations };
  assert.deepEqual(parseChildAdmissionEvidenceView(view), view);
  assert.throws(() => parseChildAdmissionEvidenceView({ ...view, originalAdmissionEpoch: "a".repeat(64) }));
  assert.throws(() => parseChildAdmissionEvidenceView({ ...view, limitations: [{ field: "private/path", code: "missing-evidence", effect: "capability-denied" }] }));
  assert.throws(() => parseChildAdmissionEvidenceView({ ...view, provenFields: new Array(1) }));
});

function runtimeFixture() {
  const f = fixture(), roots: DshAgent[] = [], owners = new Map<DshAgent, DshAgent>();
  const created: { listener?: (event: { agent: DshAgent; signal?: AbortSignal }) => Promise<void> } = {};
  const disposed: { listener?: (event: { agent: DshAgent }) => void } = {};
  const ctx: DshContext = { get(name) { return (name === "agents" ? { list: () => roots, get: (id: string) => roots.find(agent => agent.id === id), isOwnedBy: (id: string, parent: DshAgent) => owners.get(roots.find(agent => agent.id === id)!) === parent } : undefined) as never; }, on(event, listener) { if (event === "agent/created") created.listener = listener as typeof created.listener; if (event === "agent/disposed") disposed.listener = listener as typeof disposed.listener; } };
  const agent = (id: string, origin?: "subagent"): DshAgent => ({ id, status: "idle", session: { id, header: { origin }, events: [], append() {} }, async runMaintenance(callback) { return callback(new AbortController().signal); } });
  return { ...f, roots, owners, created, disposed, ctx, agent };
}

test("invocation projections are strict observed metadata, not permission-bearing wire arguments", () => {
  const invocation = { role: "dsmm-reviewer", label: "DW Reviewer · High", level: "high", routeSource: "level", route: { provider: "fixture", model: "review-high", reasoningEffort: "high" }, mode: "continuable", childId: "opaque/native/child" };
  assert.deepEqual(parseDsmmInvocationView(invocation), invocation);
  for (const invalid of [{ ...invocation, role: "dsmm-orchestrator" }, { ...invocation, level: "default" }, { ...invocation, allowRouteOverride: true }, { ...invocation, route: { provider: "fixture" } }, { ...invocation, routeSource: "PRIVATE_PATH" }, { ...invocation, childId: "\u0000PRIVATE" }]) assert.throws(() => parseDsmmInvocationView(invalid));
  const copied = parseDsmmInvocationView(invocation); copied.route!.model = "changed"; assert.equal(invocation.route.model, "review-high");
});

test("missing Host authority refuses role-policy Apply and cold child admission without committing or borrowing parent settings", async () => {
  const f = runtimeFixture();
  try {
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig({ defaultActive: true }), f.store, { validateCandidate() {} }); await runtime.initialize();
    const root = f.agent("root"); f.roots.push(root); await f.created.listener!({ agent: root });
    const old = runtime.admission(root);
    const saved = await runtime.save({ id: "focus", content: raw({ roles: { "dsmm-builder": false } }), expectedRevision: null });
    await assert.rejects(runtime.selectSession({ sessionId: "root", id: "focus", expectedRevision: saved.revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: old.epoch }, root), { code: "unavailable" });
    assert.equal((await f.store.loadSessionSelection("root")).selectionRevision, "absent"); assert.equal(runtime.admission(root), old);
    const child = f.agent("cold", "subagent"); f.roots.push(child); f.owners.set(child, root);
    await assert.rejects(f.created.listener!({ agent: child }), { code: "unavailable" });
    assert.throws(() => runtime.getSettings(child), { code: "activation" });
  } finally { f.cleanup(); }
});

test("Apply prepares authority before durable commit and publishes/rotates synchronously; a failed CAS never rotates", async () => {
  const f = runtimeFixture(), states = new Map<DshAgent, { admission: DsmmProfileAdmission; controller: AbortController; owner: object }>();
  const events: string[] = [], owner = {};
  let deliveryReady = true;
  const authority: DsmmChildAdmissionAuthority = {
    view: () => ({ binding: "dsmm", deliveryFenceReady: deliveryReady, restartRequired: false, ...(deliveryReady ? {} : { reason: "authority-not-ready" as const }) }),
    registerParent(parent, admission, actualOwner) { states.set(parent, { admission, controller: new AbortController(), owner: actualOwner }); },
    acquireParentTicket(parent): ParentAdmissionTicket { const state = states.get(parent)!; return { parent, admission: state.admission, owner: state.owner, parentEpoch: state.admission.epoch, signal: state.controller.signal }; },
    async resolveChildEvidence() { throw new Error("not used"); },
    prepareParentAdmission(parent, expectedEpoch, next) { assert.equal(states.get(parent)!.admission.epoch, expectedEpoch); assert.notEqual(expectedEpoch, next.epoch); assert.equal(existsSync(join(f.store.stateDir, ".sessions", `${hash(parent.id!)}.json`)), false); events.push("prepared"); },
    publishParentAdmission(parent, expectedEpoch, next, install) { const state = states.get(parent)!; assert.equal(state.admission.epoch, expectedEpoch); assert.equal(existsSync(join(f.store.stateDir, ".sessions", `${hash(parent.id!)}.json`)), true); events.push("publish"); const old = state.controller; install(); state.admission = next; state.controller = new AbortController(); old.abort(); events.push("rotated"); },
    revokeParent(parent) { states.get(parent)?.controller.abort(); states.delete(parent); }
  };
  try {
    const partial = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner });
    assert.equal(partial.admission().subagentRuntime?.deliveryFenceReady, false, "authority alone cannot advertise the missing completion consumers as ready");
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner,
      childAdmission: { async prepare() { throw new Error("not used by this Apply test"); }, validateRole() {} } }); await runtime.initialize();
    const root = f.agent("root"); f.roots.push(root); await f.created.listener!({ agent: root });
    const old = runtime.admission(root), ticket = authority.acquireParentTicket(root);
    deliveryReady = false;
    assert.equal(runtime.getSettings.subagentRuntime!().deliveryFenceReady, false, "safe status consumers observe current service availability, not the immutable admission-time view");
    assert.equal(old.subagentRuntime?.deliveryFenceReady, true);
    deliveryReady = true;
    const saved = await runtime.save({ id: "focus", content: raw({ roles: { "dsmm-builder": false }, locale: "de" }, " "), expectedRevision: null });
    const request = { sessionId: "root", id: "focus", expectedRevision: saved.revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: old.epoch };
    const result = await runtime.selectSession(request, root);
    assert.deepEqual(events, ["prepared", "publish", "rotated"]); assert.equal(ticket.signal.aborted, true); assert.equal(runtime.admission(root), states.get(root)!.admission);
    assert.equal(result.warnings?.[0]?.code, "blank-label"); assert.equal(result.roles?.find(role => role.id === "dsmm-builder")?.reason, "profile-disabled");
    assert.equal((await runtime.getSession(root)).warnings?.[0]?.code, "blank-label");
    await assert.rejects(async () => runtime.selectSession(request, root), { code: "conflict" }); assert.equal(events.length, 3);
  } finally { f.cleanup(); }
});

test("a delegating child's original capture, role validation and authority registration finish before publication", async () => {
  const f = runtimeFixture(), owner = {}, states = new Map<DshAgent, DsmmProfileAdmission>(), events: string[] = [];
  const signal = new AbortController().signal;
  const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: true, restartRequired: false }),
    registerParent(parent, admission) { events.push(`register:${parent.id}`); states.set(parent, admission); },
    acquireParentTicket(parent) { const admission = states.get(parent)!; return { parent, owner, admission, parentEpoch: admission.epoch, signal }; },
    async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {}, publishParentAdmission(_parent, _epoch, _next, install) { install(); }, revokeParent(parent) { states.delete(parent); } };
  try {
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole(agent) { assert.equal(states.has(agent), false); events.push("root-role"); }, childAuthority: authority, childAuthorityOwner: owner,
      childAdmission: { async prepare(agent, parent, ticket) { events.push("prepare"); const original = capture(agent.id!, parent.id!, ticket.parentEpoch); return { creation: true, evidence: original, admission: admissionFromChildCapture(original, resolveConfig()) }; }, validateRole(agent, _parent, prepared) { events.push("role"); assert.equal(states.has(agent), false); assert.equal(prepared.admission.settings.guards.gitWriteGuard, "deny"); assert.throws(() => runtime.getSettings(agent)); } } });
    await runtime.initialize(); const root = f.agent("root"); f.roots.push(root); await f.created.listener!({ agent: root });
    const child = f.agent("child", "subagent"); f.roots.push(child); f.owners.set(child, root); await f.created.listener!({ agent: child });
    assert.deepEqual(events, ["root-role", "root-role", "register:root", "prepare", "role", "register:child"]);
    assert.ok(await f.store.readChildAdmission("child", "root")); assert.equal(runtime.admission(child), states.get(child));
    assert.equal(authority.acquireParentTicket(child).admission.settings.guards.gitWriteGuard, "deny");
  } finally { f.cleanup(); }
});

test("cold child admission retains its original policy/epoch rather than a newly permissive parent's settings", async () => {
  const f = runtimeFixture(), owner = {}, states = new Map<DshAgent, DsmmProfileAdmission>();
  const signal = new AbortController().signal;
  const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: true, restartRequired: false }),
    registerParent(parent, admission) { states.set(parent, admission); },
    acquireParentTicket(parent) { const admission = states.get(parent)!; return { parent, owner, admission, parentEpoch: admission.epoch, signal }; },
    async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {}, publishParentAdmission(_parent, _epoch, _next, install) { install(); }, revokeParent(parent) { states.delete(parent); } };
  try {
    const original = capture("cold", "root"); await f.store.createChildAdmission(original);
    let validated = false;
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig({ locale: "ru", guards: { gitWriteGuard: "off" }, subagents: { allowRouteOverride: true } }), f.store, {
      validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner,
      childAdmission: { async prepare() { return { creation: false, evidence: original, admission: admissionFromChildCapture(original, resolveConfig()) }; }, validateRole(_agent, _parent, prepared) { assert.equal(prepared.admission.epoch, original.originalAdmissionEpoch); validated = true; } }
    });
    await runtime.initialize(); const root = f.agent("root"); f.roots.push(root); await f.created.listener!({ agent: root });
    assert.notEqual(runtime.admission(root).epoch, original.originalAdmissionEpoch);
    const child = f.agent("cold", "subagent"); f.roots.push(child); f.owners.set(child, root); await f.created.listener!({ agent: child });
    assert.equal(validated, true); assert.equal(runtime.admission(child).epoch, original.originalAdmissionEpoch);
    assert.equal(runtime.getSettings(child).guards.gitWriteGuard, "deny"); assert.equal(runtime.getSettings(child).locale, "ja"); assert.equal(runtime.getSettings(child).subagents.allowRouteOverride, false);
    assert.equal(authority.acquireParentTicket(child).admission, runtime.admission(child));
    assert.equal(runtime.getSettings(root).guards.gitWriteGuard, "off");
    assert.deepEqual(await f.store.readChildAdmission("cold", "root"), original);
    assert.deepEqual(await runtime.resolveOriginalChildEvidence(authority.acquireParentTicket(root), "cold", signal), original);
  } finally { f.cleanup(); }
});

test("installed guards admit an existing hierarchy parent-first and retained direct parents keep original evidence", async () => {
  const f = runtimeFixture(), owner = {}, states = new Map<DshAgent, DsmmProfileAdmission>(), events: string[] = [];
  const signal = new AbortController().signal;
  let ready = false;
  const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: ready, restartRequired: false }),
    registerParent(parent, admission) { states.set(parent, admission); events.push(`register:${parent.id}`); },
    acquireParentTicket(parent) { assert.equal(ready, true); const admission = states.get(parent)!; assert.ok(admission); return { parent, owner, admission, parentEpoch: admission.epoch, signal }; },
    async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {}, publishParentAdmission(_parent, _epoch, _next, install) { install(); }, revokeParent(parent) { states.delete(parent); } };
  try {
    const childCapture = capture("child", "root"); childCapture.role = "dsmm-builder"; childCapture.invocation.level = "normal"; childCapture.invocation.routeSource = "inherited"; childCapture.authorityCeiling = { roles: ["dsmm-builder", "dsmm-reviewer"], readOnly: false, toolFilter: { allow: ["read", "dsmm_reviewer"] }, allowRouteOverride: false, maxDepth: 3 };
    const grandCapture = capture("grand", "child"); grandCapture.authorityCeiling.maxDepth = 3;
    await f.store.createChildAdmission(childCapture); await f.store.createChildAdmission(grandCapture);
    const root = f.agent("root"), child = f.agent("child", "subagent"), grand = f.agent("grand", "subagent");
    f.roots.push(grand, child, root); f.owners.set(child, root); f.owners.set(grand, child);
    const makeRuntime = (): DsmmProfileRuntime => new DsmmProfileRuntime(f.ctx, resolveConfig({ locale: "ru", guards: { gitWriteGuard: "off" } }), f.store, {
      validateCandidate() {}, validateRootRole() { events.push("root-role"); }, childAuthority: authority, childAuthorityOwner: owner,
      onAdmissionGuardsInstalled(runtime) { assert.ok(f.created.listener); assert.equal(runtime.getSettings.subagentRuntime!().deliveryFenceReady, false); ready = true; events.push("guards-ready"); },
      childAdmission: { async prepare(agent, parent, ticket, merged) {
        assert.equal(ticket.parent, parent); events.push(`prepare:${agent.id}:via:${parent.id}`);
        const evidence = await runtime.resolveOriginalChildEvidence(ticket, agent.id!, merged);
        if ("mode" in evidence) assert.fail("a captured hierarchy cannot become legacy");
        return { evidence, creation: false, admission: admissionFromChildCapture(evidence, runtime.getStartupSettings()) };
      }, validateRole(agent, parent, candidate) {
        assert.throws(() => runtime.getSettings(agent), { code: "activation" });
        assert.equal(candidate.admission.settings.guards.gitWriteGuard, "deny");
        assert.equal(candidate.admission.epoch, "a".repeat(64));
        if (parent === child) assert.equal(authority.acquireParentTicket(parent).admission, runtime.admission(child));
        events.push(`role:${agent.id}:retained:${candidate.retained}`);
      } }
    });
    let runtime = makeRuntime(); await runtime.initialize();
    assert.deepEqual(events, ["guards-ready", "root-role", "root-role", "register:root", "prepare:child:via:root", "role:child:retained:false", "register:child", "prepare:grand:via:child", "role:grand:retained:false", "register:grand"]);
    const originalChild = runtime.admission(child), originalGrand = runtime.admission(grand);
    assert.notEqual(runtime.admission(root).epoch, originalChild.epoch);
    await assert.rejects(runtime.resolveOriginalChildEvidence(authority.acquireParentTicket(root), "grand", signal), { code: "not-owned" });
    assert.deepEqual(await runtime.resolveOriginalChildEvidence(authority.acquireParentTicket(child), "grand", signal), grandCapture);
    states.clear(); events.length = 0; ready = false; runtime = makeRuntime(); await runtime.initialize();
    assert.equal(runtime.admission(child), originalChild); assert.equal(runtime.admission(grand), originalGrand);
    assert.ok(events.includes("role:child:retained:true")); assert.ok(events.includes("role:grand:retained:true"));
    assert.equal(authority.acquireParentTicket(child).admission, originalChild);
    assert.equal(await runtime.completeAdmission(child), originalChild);
  } finally { f.cleanup(); }
});

test("original evidence reader fences epoch revocation and never downgrades corrupt captures to legacy", async () => {
  const f = runtimeFixture(), owner = {}, states = new Map<DshAgent, { admission: DsmmProfileAdmission; controller: AbortController }>();
  const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: true, restartRequired: false }),
    registerParent(parent, admission) { states.set(parent, { admission, controller: new AbortController() }); },
    acquireParentTicket(parent) { const state = states.get(parent)!; return { parent, owner, admission: state.admission, parentEpoch: state.admission.epoch, signal: state.controller.signal }; },
    async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {},
    publishParentAdmission(parent, _epoch, next, install) { const state = states.get(parent)!; install(); state.admission = next; state.controller.abort(); state.controller = new AbortController(); },
    revokeParent(parent) { states.get(parent)?.controller.abort(); states.delete(parent); } };
  try {
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner,
      childAdmission: { async prepare() { throw new Error("not used"); }, validateRole() {} } });
    await runtime.initialize(); const root = f.agent("root"); f.roots.push(root); await runtime.completeAdmission(root);
    const original = capture("cold", "root"); await f.store.createChildAdmission(original);
    let legacyCalls = 0;
    const legacy = async (_ticket: ParentAdmissionTicket, childId: string) => { legacyCalls++; return parseLegacyChildEvidence({ version: 1, mode: "legacy-conservative", childSessionId: childId, parentSessionId: "root", role: "dsmm-reviewer", route: { provider: "fixture", model: "legacy-model" }, depth: 1, provenFields: ["lineage", "role", "route"], limitations: [{ field: "git-write", code: "missing-evidence", effect: "capability-denied" }] }); };
    const ticket = authority.acquireParentTicket(root), signal = new AbortController().signal;
    assert.deepEqual(await runtime.resolveOriginalChildEvidence(ticket, "cold", signal, legacy), original); assert.equal(legacyCalls, 0);
    assert.equal((await runtime.resolveOriginalChildEvidence(ticket, "legacy", signal, legacy) as { mode: string }).mode, "legacy-conservative"); assert.equal(legacyCalls, 1);
    const path = join(f.store.stateDir, ".children", "v1", `${hash("cold")}.json`); const bytes = readFileSync(path, "utf8");
    writeFileSync(path, bytes.replace("old-model", "changed-model"));
    await assert.rejects(runtime.resolveOriginalChildEvidence(ticket, "cold", signal, legacy), { code: "corrupt-selection" }); assert.equal(legacyCalls, 1);
    writeFileSync(path, bytes);
    const read = f.store.readChildAdmission.bind(f.store);
    let started!: () => void, release!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    f.store.readChildAdmission = async (childId, parentId) => { started(); await held; return read(childId, parentId); };
    const pending = runtime.resolveOriginalChildEvidence(ticket, "cold", signal, legacy); await began;
    const saved = await runtime.save({ id: "focus", content: raw({ locale: "de" }), expectedRevision: null });
    await runtime.selectSession({ sessionId: "root", id: "focus", expectedRevision: saved.revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: ticket.parentEpoch }, root);
    release(); await assert.rejects(pending, { name: "AbortError" }); assert.equal(legacyCalls, 1);
    assert.deepEqual(await read("cold", "root"), original);
  } finally { f.cleanup(); }
});

test("capture persistence failure publishes no child admission or delegating authority", async () => {
  const f = runtimeFixture(), owner = {}, states = new Map<DshAgent, DsmmProfileAdmission>();
  const signal = new AbortController().signal;
  const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: true, restartRequired: false }),
    registerParent(parent, admission) { states.set(parent, admission); },
    acquireParentTicket(parent) { const admission = states.get(parent)!; return { parent, owner, admission, parentEpoch: admission.epoch, signal }; },
    async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {}, publishParentAdmission(_parent, _epoch, _next, install) { install(); }, revokeParent(parent) { states.delete(parent); } };
  try {
    f.store.createChildAdmission = async () => { throw new Error("PRIVATE_IO_FAILURE"); };
    let roleValidated = false;
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner,
      childAdmission: { async prepare(agent, parent, ticket) { const evidence = capture(agent.id!, parent.id!, ticket.parentEpoch); return { creation: true, evidence, admission: admissionFromChildCapture(evidence, resolveConfig()) }; }, validateRole() { roleValidated = true; } } });
    await runtime.initialize(); const root = f.agent("root"); f.roots.push(root); await f.created.listener!({ agent: root });
    const child = f.agent("failed", "subagent"); f.roots.push(child); f.owners.set(child, root);
    await assert.rejects(f.created.listener!({ agent: child }));
    assert.equal(states.has(child), false); assert.equal(roleValidated, false); assert.throws(() => runtime.admission(child), { code: "activation" });
  } finally { f.cleanup(); }
});

test("child preparation refuses a foreign owner or reconstructed parent admission before reading or persisting evidence", async () => {
  const f = runtimeFixture(), owner = {}, foreign = {}, states = new Map<DshAgent, DsmmProfileAdmission>();
  const signal = new AbortController().signal;
  let ticketOwner = owner, reconstruct = false, prepared = 0;
  const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: true, restartRequired: false }),
    registerParent(parent, admission) { states.set(parent, admission); },
    acquireParentTicket(parent) { const original = states.get(parent)!; const admission = reconstruct ? { ...original } : original; return { parent, owner: ticketOwner, admission, parentEpoch: admission.epoch, signal }; },
    async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {}, publishParentAdmission(_parent, _epoch, _next, install) { install(); }, revokeParent(parent) { states.delete(parent); } };
  try {
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner,
      childAdmission: { async prepare(agent, parent, ticket) { prepared++; const evidence = capture(agent.id!, parent.id!, ticket.parentEpoch); return { creation: true, evidence, admission: admissionFromChildCapture(evidence, resolveConfig()) }; }, validateRole() {} } });
    await runtime.initialize(); const root = f.agent("root"); f.roots.push(root); await runtime.completeAdmission(root);
    for (const mode of ["foreign", "reconstructed"] as const) {
      ticketOwner = mode === "foreign" ? foreign : owner; reconstruct = mode === "reconstructed";
      const child = f.agent(mode, "subagent"); f.roots.push(child); f.owners.set(child, root);
      await assert.rejects(runtime.completeAdmission(child), { code: "not-owned" });
      const evidence = capture(child.id!, root.id!, runtime.admission(root).epoch);
      await assert.rejects(runtime.completeChildAdmission(child, root, { creation: true, evidence, admission: admissionFromChildCapture(evidence, resolveConfig()) }), { code: "not-owned" });
      assert.equal(prepared, 0); assert.equal(states.has(child), false);
      assert.equal(await f.store.readChildAdmission(child.id!, root.id!), null);
      assert.throws(() => runtime.admission(child), { code: "activation" });
    }
  } finally { f.cleanup(); }
});

test("schema diagnostics redact identifier-shaped secrets while locating each actual unknown key", () => {
  const secret = "sk-PRIVATE_SECRET_123456789";
  for (const settings of [{ [secret]: true }, { guards: { [secret]: true } }, { roles: { [secret]: true } }, { roleRouting: { "dsmm-reviewer": { [secret]: true } } }]) {
    const json = raw(settings), issue = validateProfileDocument(json).diagnostics[0];
    assert.equal(JSON.stringify(issue).includes(secret), false);
    assert.ok(issue.field.endsWith("[unknown]"));
    assert.equal(json.slice(issue.location!.offset, issue.location!.offset + issue.location!.length), JSON.stringify(secret));
  }
  const multiple = '\uFEFF{"version":1,"id":"focus","settings":{"sk-FIRST_SECRET":1,"sk-FIRST_SECRET":2,"sk-SECOND_SECRET":3,"sk-SECOND_SECRET":4}}';
  const issues = inspectJsonDocument(multiple).diagnostics;
  assert.equal(issues.length, 2); assert.equal(JSON.stringify(issues).includes("SECRET"), false);
  for (const [index, key] of ["sk-FIRST_SECRET", "sk-SECOND_SECRET"].entries()) assert.equal(issues[index].location!.offset, multiple.lastIndexOf(JSON.stringify(key)));
  const distinct = raw({ "sk-FIRST_SECRET": true, "sk-SECOND_SECRET": false }), tree = inspectJsonDocument(distinct).tree!;
  for (const key of ["sk-FIRST_SECRET", "sk-SECOND_SECRET"]) {
    const error = new DsmmConfigValidationError("unknown-field", ["settings", key]);
    assert.equal(JSON.stringify(error).includes("SECRET"), false);
    assert.equal(fieldLocation(distinct, tree, error.diagnostic.field, diagnosticSourcePath(error))!.offset, distinct.indexOf(JSON.stringify(key)));
  }
  const source = raw({ [secret]: { constructor: true } });
  const unsafe = inspectJsonDocument(source).diagnostics[0];
  assert.equal(JSON.stringify(unsafe).includes(secret), false); assert.equal(unsafe.location!.offset, source.indexOf('"constructor"'));
  const trusted = validateProfileDocument(raw({ roles: { "dsmm-planner": false } })).diagnostics[0];
  assert.equal(trusted.field, "settings.roles.dsmm-planner");
  assert.throws(() => parseProfileDiagnostic({ severity: "error", code: "unknown-field", field: `settings.${secret}`, reason: diagnostic("unknown-field", "settings").reason }));
  const global = JSON.stringify({ [secret]: true });
  try { parseGlobalConfig(global); assert.fail("unknown global field must refuse"); } catch (error) { const info = profileErrorInfo(error); assert.equal(JSON.stringify(info).includes(secret), false); assert.equal(info.location!.offset, global.indexOf(JSON.stringify(secret))); }
});

test("capture and wire enum parsers reject string-coercible arrays and objects, including checksum-valid store reload", async () => {
  const f = fixture();
  try {
    for (const level of [["high"], new String("high"), { toString() { return "high"; } }]) assert.throws(() => parseChildAdmissionCapture({ ...capture(), invocation: { ...capture().invocation, level } }));
    for (const changed of [{ ...capture(), toolTopology: ["per-role"] }, { ...capture(), runtimePolicyCapture: { ...capture().runtimePolicyCapture, subagents: { enableRunInBackground: false, backgroundMode: ["one-shot"] } } }]) assert.throws(() => parseChildAdmissionCapture(changed));
    const legacy = { version: 1, mode: "legacy-conservative", childSessionId: "child", parentSessionId: "parent", role: "dsmm-reviewer", route: { provider: "fixture", model: "legacy" }, depth: 1, provenFields: ["lineage", "role", "route"], limitations: [{ field: "git-write", code: "missing-evidence", effect: "capability-denied" }] };
    for (const changed of [{ code: ["missing-evidence"] }, { effect: ["capability-denied"] }]) {
      const limitations = [{ ...legacy.limitations[0], ...changed }];
      assert.throws(() => parseLegacyChildEvidence({ ...legacy, limitations }));
      assert.throws(() => parseChildAdmissionEvidenceView({ mode: "legacy-conservative", parentAdmissionEpoch: "a".repeat(64), provenFields: legacy.provenFields, limitations }));
    }
    const role = { id: "dsmm-reviewer", required: false, startupAvailable: true, deploymentEnabled: true, admitted: true, source: "defaults", capture: "startup" };
    for (const changed of [{ source: ["defaults"] }, { capture: ["startup"] }, { reason: ["module-off"] }, { requiredReason: ["legacy-review"] }]) assert.throws(() => parseRoleAvailability({ ...role, ...changed }));
    assert.throws(() => parseSubagentRuntimeAdmissionView({ binding: ["unavailable"], deliveryFenceReady: false, restartRequired: true }));
    assert.throws(() => parseSubagentRuntimeAdmissionView({ binding: "unavailable", deliveryFenceReady: false, restartRequired: true, reason: ["authority-not-ready"] }));
    const invocation = { role: "dsmm-reviewer", label: "DW Reviewer", level: "high", routeSource: "level", mode: "one-shot" };
    for (const changed of [{ level: ["high"] }, { mode: ["one-shot"] }]) assert.throws(() => parseDsmmInvocationView({ ...invocation, ...changed }));
    const codec = TYPERT_REMOTE.descriptors.find(row => row.method === "describe" && row.service === "dsmmProfiles")!.result;
    if (codec.mode !== "strict") assert.fail("expected native strict codec");
    assert.throws(() => codec.create().parse({ profiles: [], selectedId: null, appliedRevision: null, selectionRevision: "absent", origin: ["central"] }));
    const input = capture("reload", "parent"); await f.store.createChildAdmission(input);
    const path = join(f.store.stateDir, ".children", "v1", `${hash("reload")}.json`);
    const malformed = { ...input, invocation: { ...input.invocation, level: ["high"] } };
    writeFileSync(path, JSON.stringify({ version: 1, revision: hash(JSON.stringify(malformed)), capture: malformed }));
    await assert.rejects(f.store.readChildAdmission("reload", "parent"), { code: "corrupt-selection" });
  } finally { f.cleanup(); }
});

test("a disappeared pinned child namespace is unsafe and cannot trigger legacy recovery", async () => {
  for (const namespace of [".children", ".children/v1"]) {
    const f = runtimeFixture(), owner = {}, states = new Map<DshAgent, DsmmProfileAdmission>(), signal = new AbortController().signal;
    const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: true, restartRequired: false }), registerParent(parent, admission) { states.set(parent, admission); }, acquireParentTicket(parent) { const admission = states.get(parent)!; return { parent, owner, admission, parentEpoch: admission.epoch, signal }; }, async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {}, publishParentAdmission(_parent, _epoch, _next, install) { install(); }, revokeParent(parent) { states.delete(parent); } };
    try {
      const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner, childAdmission: { async prepare() { throw new Error("not used"); }, validateRole() {} } });
      await runtime.initialize(); const root = f.agent("parent"); f.roots.push(root); await runtime.completeAdmission(root);
      const original = capture("child", "parent"); await f.store.createChildAdmission(original);
      const path = join(f.store.stateDir, ".children", "v1", `${hash("child")}.json`), bytes = readFileSync(path);
      const moved = join(f.directory, "retained-namespace"); renameSync(join(f.store.stateDir, namespace), moved);
      let legacyCalls = 0;
      await assert.rejects(runtime.resolveOriginalChildEvidence(authority.acquireParentTicket(root), "child", signal, async () => { legacyCalls++; throw new Error("legacy must not run"); }), { code: "unsafe-path" });
      assert.equal(legacyCalls, 0);
      const movedRecord = namespace === ".children" ? join(moved, "v1", `${hash("child")}.json`) : join(moved, `${hash("child")}.json`);
      assert.deepEqual(readFileSync(movedRecord), bytes);
      assert.equal(existsSync(join(f.store.stateDir, namespace)), false);
    } finally { f.cleanup(); }
  }
});

for (const invalidation of ["cancel", "revoke", "child-dispose", "publish"] as const) test(`waiting child capture writes nothing after ${invalidation} invalidates authority`, async () => {
  const f = runtimeFixture(), c = fixture(), owner = {}, states = new Map<DshAgent, { admission: DsmmProfileAdmission; controller: AbortController }>();
  const caller = new AbortController();
  const authority: DsmmChildAdmissionAuthority = { view: () => ({ binding: "dsmm", deliveryFenceReady: true, restartRequired: false }), registerParent(parent, admission) { states.set(parent, { admission, controller: new AbortController() }); }, acquireParentTicket(parent) { const state = states.get(parent)!; return { parent, owner, admission: state.admission, parentEpoch: state.admission.epoch, signal: state.controller.signal }; }, async resolveChildEvidence() { throw new Error("not used"); }, prepareParentAdmission() {}, publishParentAdmission(parent, _epoch, next, install) { const previous = states.get(parent)!; install(); states.set(parent, { admission: next, controller: new AbortController() }); previous.controller.abort(); }, revokeParent(parent) { states.get(parent)?.controller.abort(); states.delete(parent); } };
  const lock = join(c.store.profileDir, ".lock");
  try {
    const runtime = new DsmmProfileRuntime(f.ctx, resolveConfig(), f.store, { validateCandidate() {}, validateRootRole() {}, childAuthority: authority, childAuthorityOwner: owner, childCaptureStore: c.store, childAdmission: { async prepare(agent, parent, ticket) { const evidence = capture(agent.id!, parent.id!, ticket.parentEpoch); return { creation: true, evidence, admission: admissionFromChildCapture(evidence, resolveConfig()) }; }, validateRole() {} } });
    await runtime.initialize(); const root = f.agent("root"); f.roots.push(root); await runtime.completeAdmission(root);
    const accepted = f.agent("accepted", "subagent"); f.roots.push(accepted); f.owners.set(accepted, root); await runtime.completeAdmission(accepted);
    const prior = runtime.admission(accepted), acceptedTicket = authority.acquireParentTicket(accepted);
    const acceptedPath = join(c.store.stateDir, ".children", "v1", `${hash("accepted")}.json`), bytes = readFileSync(acceptedPath);
    writeFileSync(lock, "held by test owner\n", { flag: "wx" });
    let started!: () => void; const waiting = new Promise<void>(resolve => { started = resolve; });
    const create = c.store.createChildAdmission.bind(c.store);
    c.store.createChildAdmission = (...args) => { started(); return create(...args); };
    const child = f.agent("pending", "subagent"); f.roots.push(child); f.owners.set(child, root);
    const pending = runtime.completeAdmission(child, caller.signal); const rejected = assert.rejects(pending); await waiting;
    if (invalidation === "cancel") caller.abort();
    if (invalidation === "revoke") authority.revokeParent(root, "test-revocation");
    if (invalidation === "child-dispose") f.disposed.listener!({ agent: child });
    if (invalidation === "publish") { const saved = await runtime.save({ id: "focus", content: raw({ locale: "de" }), expectedRevision: null }); await runtime.selectSession({ sessionId: "root", id: "focus", expectedRevision: saved.revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: runtime.admission(root).epoch }, root); }
    unlinkSync(lock); await rejected;
    assert.equal(existsSync(join(c.store.stateDir, ".children", "v1", `${hash("pending")}.json`)), false);
    assert.equal(states.has(child), false); assert.equal(runtime.admission(accepted), prior); assert.equal(acceptedTicket.signal.aborted, false);
    assert.deepEqual(readFileSync(acceptedPath), bytes);
  } finally { if (existsSync(lock)) unlinkSync(lock); c.cleanup(); f.cleanup(); }
});
