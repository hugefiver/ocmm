import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { parse } from "jsonc-parser";
import { ProfilesController } from "../lib/client/controller.js";
import { editStructuredPath, moveFallback, structuredDocument } from "../lib/client/structured.js";
import { sessionProfileLabels } from "../lib/client/session-labels.js";
import { en, zh, RETRY_FIELD_LABEL_KEYS } from "../lib/client/locales.js";
import { PROFILE_STYLES } from "../lib/client/styles.js";
import { DSMM_RATE_LIMIT_BOUNDS } from "../lib/routing-policy.js";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { DsmmProfilesRemote } from "../lib/profile-remote.js";
import type { ProfileSnapshot, SessionProfileSnapshot, SessionProfileSelectRequest } from "../lib/profile-types.js";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import type { ModelCatalog } from "@deepseek-ai/dsh-api-session-controller";

const revision = "a".repeat(64), otherRevision = "b".repeat(64);
const content = `{
  // untouched document comment
  "version": 1, "id": "p", "label": "P",
  "settings": {
    "workflow": { "reviewCap": 2 }, // untouched workflow bytes
    "runtimePolicy": { "strategy": "startup-lock" },
    "roleRouting": { "dsmm-planner": {
      "primary": { "provider": "manual", /* route comment */ "model": "unlisted", "reasoningEffort": "exact-custom" },
      "fallbackRoutes": [
        { "provider": "one", /* first preserved */ "model": "m1" },
        { "provider": "two", /* second preserved */ "model": "m2", "reasoningEffort": "max" }
      ],
      "strategy": "rate-limit-fallback", "rateLimit": { "maxRetries": 0, "switchAfterRateLimits": 1 }
    }}
  }
}\n`;
const snapshot: ProfileSnapshot = { profiles: [{ id: "p", label: "P", revision }], selectedId: null, appliedRevision: null, selectionRevision: "absent" };
function session(id: string, epoch = "epoch-1"): SessionProfileSnapshot {
  return { sessionId: id, globalDefault: { selectedId: null, appliedRevision: null, selectionRevision: "absent" }, selection: { selectedId: null, appliedRevision: null, selectionRevision: "absent" }, scope: "global-default", admissionEpoch: epoch, switchAllowed: true };
}
function success<T>(value: T): RemoteResult<T> { return { ok: true, value }; }
const translate: PropsLocale<"settings.dsmm-profiles">["t"] = (key, values) => {
  const copy = Object.hasOwn(en, key) ? en[key as keyof typeof en] : key;
  return copy.replace(/\{([^}]+)\}/gu, (placeholder, name: string) => values === undefined || !Object.hasOwn(values, name) ? placeholder : String(values[name]));
};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function fixture(overrides: Partial<DsmmProfilesRemote> = {}) {
  const calls: string[] = [];
  const selections: SessionProfileSelectRequest[] = [];
  const remote: DsmmProfilesRemote = {
    describe: async () => { calls.push("describe"); return success(snapshot); },
    read: async (id) => { calls.push(`read:${id}`); return success({ id, content, revision }); },
    save: async (request) => { calls.push("save"); return success({ id: request.id, content: request.content, revision: otherRevision }); },
    select: async (request) => { calls.push("select"); return success({ ...snapshot, selectedId: request.id, appliedRevision: request.id === null ? null : request.expectedRevision! }); },
    describeSession: async (id) => { calls.push(`describeSession:${id}`); return success(session(id)); },
    selectSession: async (id, request) => { calls.push(`selectSession:${id}`); selections.push(request); return success({ ...session(id, "epoch-2"), selection: { selectedId: request.id, appliedRevision: request.expectedRevision ?? null, selectionRevision: otherRevision }, scope: "session-override" }); },
    ...overrides,
  };
  return { controller: new ProfilesController(remote), calls, selections };
}
async function settle(controller: ProfilesController) {
  for (let round = 0; round < 100 && controller.store.getSnapshot().sessionBusy !== null; round++) await setImmediate();
  assert.equal(controller.store.getSnapshot().sessionBusy, null);
}

test("structured path editing preserves unrelated JSONC and explicit inheritance/empty-chain semantics", () => {
  const next = editStructuredPath(content, ["settings", "roleRouting", "dsmm-planner", "rateLimit", "maxRetries"], 4)!;
  assert.ok(next.includes('// untouched document comment'));
  assert.ok(next.includes('"workflow": { "reviewCap": 2 }, // untouched workflow bytes'));
  assert.ok(next.includes('/* route comment */'));
  const empty = editStructuredPath(next, ["settings", "roleRouting", "dsmm-planner", "fallbackRoutes"], [])!;
  assert.deepEqual(structuredDocument(empty)!.roleRouting["dsmm-planner"].fallbackRoutes, []);
  const inherited = editStructuredPath(empty, ["settings", "roleRouting", "dsmm-planner", "fallbackRoutes"], undefined)!;
  assert.equal(Object.hasOwn(structuredDocument(inherited)!.roleRouting["dsmm-planner"], "fallbackRoutes"), false);
  assert.equal(structuredDocument(content)!.roleRouting["dsmm-planner"].rateLimit!.maxRetries, 0);
});

test("retry controls have readable bilingual names and narrow/zoom labels wrap rather than clipping", () => {
  assert.deepEqual(Object.keys(RETRY_FIELD_LABEL_KEYS).sort(), Object.keys(DSMM_RATE_LIMIT_BOUNDS).sort());
  for (const [field, key] of Object.entries(RETRY_FIELD_LABEL_KEYS)) {
    assert.notEqual(en[key], field); assert.notEqual(zh[key], field);
    assert.ok(en[key].includes(" ")); assert.match(zh[key], /[\u4e00-\u9fff]/u);
  }
  assert.equal(translate("retryField", { name: "DW Planner", field: en[RETRY_FIELD_LABEL_KEYS.maxRetries] }), "DW Planner retry count");
  assert.equal(translate("retryField", { name: "DW Planner", field: en[RETRY_FIELD_LABEL_KEYS.switchAfterRateLimits] }), "DW Planner rate-limit failures before switch");
  assert.ok(PROFILE_STYLES.includes(".dsmm-profiles :is(label,legend,summary){min-width:0;max-width:100%;overflow-wrap:anywhere}"));
  assert.equal(/overflow-x\s*:\s*hidden|text-overflow\s*:\s*clip/u.test(PROFILE_STYLES), false);
});

test("fallback reorder preserves original object text/comments and never mutates an out-of-range index", () => {
  const next = moveFallback(content, "dsmm-planner", 1, 0)!;
  assert.deepEqual(structuredDocument(next)!.roleRouting["dsmm-planner"].fallbackRoutes!.map((route) => route.provider), ["two", "one"]);
  assert.ok(next.includes('{ "provider": "one", /* first preserved */ "model": "m1" }'));
  assert.ok(next.includes('{ "provider": "two", /* second preserved */ "model": "m2", "reasoningEffort": "max" }'));
  assert.equal(moveFallback(content, "dsmm-planner", 0, -1), null);
});

test("invalid raw syntax, duplicate keys, unsafe keys and malformed policies cannot be normalized by structured controls", () => {
  for (const invalid of [content.slice(0, -4), content.replace('"version": 1', '"version": 1, "version": 1'), content.replace('"reviewCap": 2', '"__proto__": {}'), content.replace('"maxRetries": 0', '"maxRetries": 99'), content.replace('"strategy": "rate-limit-fallback"', '"strategy": "unknown"')]) {
    assert.equal(structuredDocument(invalid), null);
    assert.equal(editStructuredPath(invalid, ["label"], "normalized"), null);
  }
});

test("native catalog refresh retains exact manual route/effort and only explicit model edits clear effort", async () => {
  const f = fixture();
  await f.controller.refresh(); await f.controller.open("p");
  const catalog: ModelCatalog = { default: { provider: "listed", model: "other" }, routableProviders: ["listed"], groups: [], failures: [] };
  f.controller.attachCatalog({ modelCatalog: async () => success(catalog) });
  await setImmediate();
  assert.equal(f.controller.store.getSnapshot().editor!.content, content);
  assert.equal(f.controller.store.getSnapshot().dirty, false);
  f.controller.actions.editRoute(["settings", "roleRouting", "dsmm-planner", "primary"], "manual", "new-unlisted");
  const next = f.controller.store.getSnapshot().editor!.content;
  assert.equal(structuredDocument(next)!.roleRouting["dsmm-planner"].primary!.reasoningEffort, undefined);
  assert.ok(next.includes('/* route comment */'));
  assert.ok(next.includes('"workflow": { "reviewCap": 2 }, // untouched workflow bytes'));
  assert.deepEqual(f.calls, ["describe", "read:p"]);
  f.controller.dispose();
});

test("current-session Apply uses session CAS/epoch without selecting the global default or changing the draft", async () => {
  const f = fixture();
  await f.controller.refresh(); await f.controller.open("p");
  f.controller.setSession("native-root-one"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); await f.controller.actions.applySession();
  assert.deepEqual(f.selections, [{ sessionId: "native-root-one", id: "p", expectedRevision: revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: "epoch-1" }]);
  assert.equal(f.controller.store.getSnapshot().snapshot!.selectedId, null);
  assert.equal(f.controller.store.getSnapshot().editor!.content, content);
  assert.equal(f.controller.store.getSnapshot().session!.admissionEpoch, "epoch-2");
  assert.equal(f.calls.includes("select"), false);
  f.controller.dispose();
});

test("session labels keep captured profile A distinct from future global B without changing CAS or a dirty draft", async () => {
  const captured: SessionProfileSnapshot = {
    ...session("native-admitted-a"),
    globalDefault: { selectedId: "profile-b", appliedRevision: otherRevision, selectionRevision: otherRevision },
    admittedSelection: { selectedId: "profile-a", appliedRevision: revision, selectionRevision: revision },
  };
  const f = fixture({ describeSession: async () => success(captured) });
  await f.controller.refresh(); await f.controller.open("p");
  f.controller.actions.editPath(["label"], "Keep this dirty draft");
  const draft = f.controller.store.getSnapshot().editor!.content;
  f.controller.setSession(captured.sessionId); await settle(f.controller);
  const state = f.controller.store.getSnapshot();
  const labels = sessionProfileLabels(state.session!, translate);
  assert.ok(labels.admitted.includes("profile-a (revision aaaaaaaaaaaa)"));
  assert.equal(labels.admitted.includes("profile-b"), false);
  assert.ok(labels.futureDefault.includes("Global default for future unscoped sessions: profile-b (revision bbbbbbbbbbbb)"));
  assert.deepEqual(state.session!.selection, { selectedId: null, appliedRevision: null, selectionRevision: "absent" });
  assert.equal(state.sessionChoice, null, "display admission never substitutes the chosen sidecar/CAS target");
  assert.equal(state.editor!.content, draft); assert.equal(state.dirty, true);
  assert.equal(f.calls.includes("select"), false); assert.deepEqual(f.selections, []);
  f.controller.dispose();
});

test("old session DTO labels remain honest when exact admitted identity is absent", () => {
  const old = { ...session("old-native"), globalDefault: { selectedId: "new-global", appliedRevision: otherRevision, selectionRevision: otherRevision } };
  const labels = sessionProfileLabels(old, translate);
  assert.ok(labels.admitted.includes("captured global default (no explicit session override)"));
  assert.equal(labels.admitted.includes("new-global"), false);
  assert.equal(labels.admitted.includes("deployment baseline"), false);
  assert.ok(labels.futureDefault.includes("new-global"));
  const explicit = { ...old, scope: "session-override" as const, selection: { selectedId: "pinned-old", appliedRevision: revision, selectionRevision: revision } };
  assert.ok(sessionProfileLabels(explicit, translate).admitted.includes("pinned-old (revision aaaaaaaaaaaa)"));
});

test("changing current native view fences pending session responses and disposal fences retained actions", async () => {
  const old = deferred<RemoteResult<SessionProfileSnapshot>>();
  const f = fixture({ describeSession: async (id) => id === "native-old" ? old.promise : success(session(id)) });
  await f.controller.refresh(); f.controller.setSession("native-old"); f.controller.setSession("native-new"); await settle(f.controller);
  old.resolve(success(session("native-old", "stale-epoch"))); await setImmediate();
  assert.equal(f.controller.store.getSnapshot().session!.sessionId, "native-new");
  assert.equal(f.controller.store.getSnapshot().session!.admissionEpoch, "epoch-1");
  const accepted = f.controller.store.getSnapshot(); f.controller.dispose();
  f.controller.setSession("other"); f.controller.actions.chooseSessionProfile("p"); await f.controller.actions.refreshSession(); await f.controller.actions.applySession();
  assert.equal(f.controller.store.getSnapshot(), accepted);
});

test("a switched view cannot receive the old session's delayed apply response", async () => {
  const applied = deferred<RemoteResult<SessionProfileSnapshot>>();
  const f = fixture({ selectSession: async () => applied.promise });
  await f.controller.refresh(); f.controller.setSession("old-root"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); const pending = f.controller.actions.applySession();
  f.controller.setSession("new-root"); await settle(f.controller);
  applied.resolve(success({ ...session("old-root", "old-new-epoch"), scope: "session-override", selection: { selectedId: "p", appliedRevision: revision, selectionRevision: otherRevision } }));
  await pending;
  assert.equal(f.controller.store.getSnapshot().session!.sessionId, "new-root");
  assert.equal(f.controller.store.getSnapshot().sessionNotice, null);
  assert.equal(f.controller.store.getSnapshot().snapshot!.selectedId, null);
  f.controller.dispose();
});

test("native catalog withdrawal fences delayed catalog results without rewriting a manual draft", async () => {
  const catalog = deferred<RemoteResult<ModelCatalog>>();
  const f = fixture(); await f.controller.refresh(); await f.controller.open("p");
  f.controller.attachCatalog({ modelCatalog: async () => catalog.promise });
  f.controller.attachCatalog(null);
  catalog.resolve(success({ default: { provider: "unexpected", model: "unexpected" }, routableProviders: [], groups: [], failures: [] }));
  await setImmediate();
  const state = f.controller.store.getSnapshot();
  assert.equal(state.catalog, null); assert.equal(state.catalogUnavailable, true); assert.equal(state.catalogBusy, false);
  assert.equal(state.editor!.content, content); assert.equal(state.dirty, false);
  f.controller.dispose();
});

test("session conflicts, busy sessions, invalid form fields and dirty drafts refuse commit without losing state", async () => {
  const f = fixture({ selectSession: async () => ({ ok: false, error: new RemoteError("dsmm-profiles/refused", "refused", { code: "conflict", message: "Session epoch changed" }) }) });
  await f.controller.refresh(); await f.controller.open("p"); f.controller.setSession("native-root"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); await f.controller.actions.applySession();
  assert.equal(f.controller.store.getSnapshot().sessionIssue!.code, "conflict");
  assert.equal(f.controller.store.getSnapshot().session!.selection.selectedId, null);
  f.controller.actions.setFieldInvalid("maxRetries", true); await f.controller.actions.save();
  assert.equal(f.calls.includes("save"), false);
  f.controller.actions.editPath(["label"], "Draft");
  const dirty = f.controller.store.getSnapshot().editor!.content;
  assert.equal(parse(dirty).label, "Draft");
  await f.controller.actions.applySession();
  assert.equal(f.controller.store.getSnapshot().editor!.content, dirty);
  f.controller.dispose();
});
