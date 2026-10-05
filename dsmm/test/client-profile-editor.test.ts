import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { parse } from "jsonc-parser";
import { ProfilesController } from "../lib/client/controller.js";
import { editStructuredPath, moveFallback, structuredDocument } from "../lib/client/structured.js";
import { sessionProfileLabels } from "../lib/client/session-labels.js";
import { en, zh, RETRY_FIELD_LABEL_KEYS } from "../lib/client/locales.js";
import { PROFILE_STYLES } from "../lib/client/styles.js";
import { DSMM_RATE_LIMIT_BOUNDS } from "../lib/routing-policy.js";
import { isValidElement } from "react";
import type { ReactElement } from "react";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesActions, ProfilesViewSnapshot } from "../lib/client/controller.js";
import type { DsmmProfilesRemote } from "../lib/profile-remote.js";
import type { ProfileSnapshot, SessionProfileSnapshot, SessionProfileSelectRequest } from "../lib/profile-types.js";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import type { ModelCatalog } from "@deepseek-ai/dsh-api-session-controller";
import type { SessionSelectModelRequest } from "@deepseek-ai/dsh-api-session-controller";
import type { SessionEventSource } from "@deepseek-ai/dsh-api-session-controller/client";
import { isProfileId } from "../lib/profile-remote.js";

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
function modelObservation() {
  let snapshot: unknown = { lastUsed: null, next: { provider: "native", model: "current-native" } };
  const listeners = new Set<() => void>();
  return {
    source: { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    change(value: unknown, notify = true) { snapshot = value; if (notify) for (const listener of listeners) listener(); },
    invalidate() { for (const listener of listeners) listener(); },
  };
}
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
  const controller = new ProfilesController(remote), observation = modelObservation();
  const events: SessionEventSource = { getSnapshot: () => ({ entries: [], hasMore: false, revision: 0, change: { kind: "replace", entries: [] } }), subscribe: () => () => {} };
  const interaction = { getSnapshot: () => ({ status: "ready" as const }), subscribe: () => () => {} };
  let currentBinding: string | null = null;
  // Unit fixture for the real native adapter's read-only keyed projection seat.
  controller.store.subscribe(() => {
    const id = controller.store.getSnapshot().currentSessionId;
    if (id !== currentBinding) {
      currentBinding = id;
      controller.attachModelSelectionSource(id, id === null ? null : observation.source);
      controller.attachModelEventSource(id, id === null ? null : events);
      controller.attachModelInteractionSource(id, id === null ? null : interaction);
    }
  });
  return { controller, calls, selections, modelObservation: observation };
}
async function settle(controller: ProfilesController) {
  for (let round = 0; round < 100 && controller.store.getSnapshot().sessionBusy !== null; round++) await setImmediate();
  assert.equal(controller.store.getSnapshot().sessionBusy, null);
}

type HeaderInput = ProfilesActions & { sessionId?: string; useProfiles(selector: (value: ProfilesViewSnapshot) => ProfilesViewSnapshot): ProfilesViewSnapshot; t: PropsLocale<"settings.dsmm-profiles">["t"] };
type HeaderComponent = (props: HeaderInput) => unknown;
async function nativeHeaderComponent(): Promise<HeaderComponent> {
  const require = createRequire(import.meta.url);
  let factory: ((require: (id: string) => unknown) => { SessionProfiles: HeaderComponent }) | undefined;
  const realm = createContext({ TextEncoder, TextDecoder,
    window: { __ModuleLoader__: { load(row: { factory: typeof factory }) { factory = row.factory; } } },
  });
  runInContext(await readFile(new URL("../lib/client.js", import.meta.url), "utf8"), realm);
  assert.ok(factory);
  return factory((id) => {
    // JSX tree contract only, not a renderer/browser substitute. All header
    // behavior runs from the compiled production module and real controller.
    if (id === "react") return { ...require("react"), useId: () => "header-unit" };
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Button() { throw new Error("The compact header must not render action buttons"); }, Input() { throw new Error("The compact header must use a native select"); } };
    assert.equal(id, "react/jsx-runtime");
    return require(id);
  }).SessionProfiles;
}
function headerTree(component: HeaderComponent, controller: ProfilesController, id = controller.store.getSnapshot().currentSessionId): unknown {
  return component({ ...controller.actions, sessionId: id ?? undefined, useProfiles: (select) => select(controller.store.getSnapshot()), t: translate });
}
function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}
function headerSelect(tree: unknown) {
  const select = elements(tree).find((element) => element.type === "select"); assert.ok(select);
  return select as ReactElement<{ value: string; disabled: boolean; "aria-label": string; onChange(event: { currentTarget: { value: string } }): void }>;
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

test("compiled header exposes one keyboard-named dropdown and no Settings disclosure/action paragraphs", async () => {
  const component = await nativeHeaderComponent();
  const admitted = { ...session("header-root"), admittedSelection: { selectedId: "missing-pinned", appliedRevision: revision, selectionRevision: revision } };
  const f = fixture({ describeSession: async () => success(admitted) });
  await f.controller.refresh(); f.controller.setSession(admitted.sessionId); await settle(f.controller);
  const tree = headerTree(component, f.controller);
  const nodes = elements(tree);
  assert.equal(nodes.filter((node) => node.type === "select").length, 1);
  assert.equal(nodes.filter((node) => ["button", "details", "summary", "p"].includes(String(node.type))).length, 0);
  const select = headerSelect(tree);
  assert.equal(select.props["aria-label"], "Current-session profile (header)");
  assert.equal(select.props.value, "missing-pinned", "an absent sidecar must not mislabel the admitted profile as baseline");
  const retained = nodes.find((node) => node.type === "option" && node.props.value === "missing-pinned");
  assert.ok(retained); assert.equal(retained.props.disabled, true);
  assert.deepEqual(f.selections, []);
  f.controller.dispose();
});

test("header dropdown immediately applies with existing CAS, then displays accepted admission without global mutation", async () => {
  const component = await nativeHeaderComponent();
  const f = fixture(); await f.controller.refresh(); f.controller.setSession("header-root"); await settle(f.controller);
  headerSelect(headerTree(component, f.controller)).props.onChange({ currentTarget: { value: "p" } }); await settle(f.controller);
  assert.deepEqual(f.selections, [{ sessionId: "header-root", id: "p", expectedRevision: revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: "epoch-1" }]);
  assert.equal(headerSelect(headerTree(component, f.controller)).props.value, "p");
  assert.equal(f.calls.includes("select"), false);
  f.controller.dispose();
});

test("header refusal retains admitted selection and dirty drafts disable selection without automatic discard", async () => {
  const component = await nativeHeaderComponent();
  const admitted = { ...session("header-root"), admittedSelection: { selectedId: "old-profile", appliedRevision: revision, selectionRevision: revision } };
  const f = fixture({ describeSession: async () => success(admitted), selectSession: async () => ({ ok: false, error: new RemoteError("dsmm-profiles/refused", "refused", { code: "conflict", message: "Epoch changed" }) }) });
  await f.controller.refresh(); f.controller.setSession(admitted.sessionId); await settle(f.controller);
  headerSelect(headerTree(component, f.controller)).props.onChange({ currentTarget: { value: "p" } }); await settle(f.controller);
  const refused = headerTree(component, f.controller);
  assert.equal(headerSelect(refused).props.value, "old-profile");
  assert.ok(elements(refused).some((node) => node.type === "span" && node.props.role === "alert"));
  await f.controller.open("p"); f.controller.actions.editPath(["label"], "Keep dirty header draft");
  const draft = f.controller.store.getSnapshot().editor!.content;
  const dirty = headerTree(component, f.controller); assert.equal(headerSelect(dirty).props.disabled, true);
  headerSelect(dirty).props.onChange({ currentTarget: { value: "" } }); await settle(f.controller);
  assert.equal(f.controller.store.getSnapshot().editor!.content, draft);
  assert.equal(f.controller.store.getSnapshot().session!.admissionEpoch, "epoch-1");
  f.controller.dispose();
});

test("header distinguishes unknown captured defaults from explicit baseline and fences old-view response", async () => {
  const component = await nativeHeaderComponent(); const pending = deferred<RemoteResult<SessionProfileSnapshot>>();
  const baseline = fixture({ describeSession: async (id) => success({ ...session(id), scope: "deployment-baseline", admittedSelection: { selectedId: null, appliedRevision: null, selectionRevision: revision } }) });
  await baseline.controller.refresh(); baseline.controller.setSession("explicit-baseline"); await settle(baseline.controller);
  assert.equal(headerSelect(headerTree(component, baseline.controller)).props.value, "");
  baseline.controller.dispose();
  const f = fixture({ selectSession: async () => pending.promise });
  await f.controller.refresh(); f.controller.setSession("old-header"); await settle(f.controller);
  assert.equal(headerSelect(headerTree(component, f.controller)).props.value, "__dsmm_captured_default__");
  headerSelect(headerTree(component, f.controller)).props.onChange({ currentTarget: { value: "p" } });
  assert.equal(headerSelect(headerTree(component, f.controller)).props.disabled, true);
  f.controller.setSession("new-header"); await settle(f.controller);
  pending.resolve(success({ ...session("old-header", "old-new-epoch"), scope: "session-override", selection: { selectedId: "p", appliedRevision: revision, selectionRevision: otherRevision } })); await setImmediate();
  assert.equal(headerTree(component, f.controller, "old-header"), null);
  assert.equal(headerSelect(headerTree(component, f.controller)).props.value, "__dsmm_captured_default__");
  assert.equal(f.controller.store.getSnapshot().sessionNotice, null);
  f.controller.dispose();
});

test("header busy-session feedback disables the dropdown and existing controller refuses an apply", async () => {
  const component = await nativeHeaderComponent();
  const f = fixture({ describeSession: async (id) => success({ ...session(id), switchAllowed: false, switchUnavailableReason: "busy" }) });
  await f.controller.refresh(); f.controller.setSession("busy-header"); await settle(f.controller);
  const tree = headerTree(component, f.controller);
  assert.equal(headerSelect(tree).props.disabled, true);
  assert.ok(elements(tree).some((node) => node.type === "span" && node.props.children === "Session is busy."));
  headerSelect(tree).props.onChange({ currentTarget: { value: "p" } }); await settle(f.controller);
  assert.deepEqual(f.selections, []);
  f.controller.dispose();
});

function appliedWithModel(id: string, model = "profile-main"): SessionProfileSnapshot {
  return { ...session(id, "epoch-2"), scope: "session-override", selection: { selectedId: "p", appliedRevision: revision, selectionRevision: otherRevision },
    admittedSelection: { selectedId: "p", appliedRevision: revision, selectionRevision: otherRevision },
    profileModel: { provider: "manual-provider", model, reasoningEffort: "exact-profile-effort" } };
}

test("normal switches, profile saves, model-field edits and session reads never select a native model", async () => {
  const calls: SessionSelectModelRequest[] = [];
  const f = fixture({ describeSession: async (id) => success({ ...session(id), profileModel: appliedWithModel(id).profileModel }), selectSession: async (id) => success(appliedWithModel(id)) });
  f.controller.attachModelSelector({ selectModel: async (request) => { calls.push(request); return success({ selected: request }); } });
  await f.controller.refresh(); f.controller.setSession("preserve-native"); await settle(f.controller);
  await f.controller.actions.refreshSession();
  f.controller.actions.chooseSessionProfile("p"); await f.controller.actions.applySession();
  await f.controller.open("p"); f.controller.actions.editRoute(["settings", "roleRouting", "dsmm-planner", "primary"], "edited-provider", "edited-model");
  await f.controller.actions.save();
  assert.deepEqual(calls, []);
  f.controller.dispose();
});

test("explicit switch-and-use-model group invokes native selection only after accepted profile CAS", async () => {
  const component = await nativeHeaderComponent(); const accepted = deferred<RemoteResult<SessionProfileSnapshot>>();
  const calls: SessionSelectModelRequest[] = [];
  const f = fixture({ selectSession: async () => accepted.promise });
  f.controller.attachModelSelector({ selectModel: async (request) => { calls.push(request); return success({ selected: request }); } });
  await f.controller.refresh(); f.controller.setSession("explicit-native"); await settle(f.controller);
  const tree = headerTree(component, f.controller);
  const group = elements(tree).find((node) => node.type === "optgroup" && node.props.label === "Switch and use profile model"); assert.ok(group);
  const option = elements(group).find((node) => node.type === "option" && node.props.value === "@model:p"); assert.ok(option);
  assert.equal(isProfileId(String(option.props.value)), false, "model-action options cannot collide with any profile ID");
  headerSelect(tree).props.onChange({ currentTarget: { value: "@model:p" } });
  assert.deepEqual(calls, []);
  accepted.resolve(success(appliedWithModel("explicit-native"))); await settle(f.controller);
  assert.deepEqual(calls, [{ sessionId: "explicit-native", provider: "manual-provider", model: "profile-main", reasoningEffort: "exact-profile-effort" }]);
  assert.equal(f.controller.store.getSnapshot().sessionNotice, "applied-with-model");
  assert.equal(headerSelect(headerTree(component, f.controller)).props.value, "p", "the admitted ID, never an action prefix, remains selected");
  assert.equal(f.controller.store.getSnapshot().snapshot!.selectedId, null);
  f.controller.dispose();
});

test("native model selection failure preserves the accepted profile and reports partial success without rollback", async () => {
  const f = fixture({ selectSession: async (id) => success(appliedWithModel(id)) });
  let calls = 0;
  f.controller.attachModelSelector({ selectModel: async () => { calls++; throw new Error("Do not expose private provider details"); } });
  await f.controller.refresh(); f.controller.setSession("model-failed"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); await f.controller.actions.applySession({ useProfileModel: true });
  const state = f.controller.store.getSnapshot();
  assert.equal(calls, 1); assert.equal(state.session!.selection.selectedId, "p"); assert.equal(state.session!.admissionEpoch, "epoch-2");
  assert.equal(state.sessionNotice, null); assert.equal(state.sessionIssue!.source, "profile-model"); assert.equal(state.sessionIssue!.code, "model-selection-failed");
  assert.equal(state.sessionIssue!.message, undefined);
  assert.equal(state.snapshot!.selectedId, null);
  const component = await nativeHeaderComponent();
  assert.ok(elements(headerTree(component, f.controller)).some((node) => node.type === "span" && node.props.children === "Profile applied; model change unconfirmed. Check Models/Settings."));
  f.controller.dispose();
});

test("explicit missing profile model preserves current native model and reports the committed profile honestly", async () => {
  const f = fixture(); let calls = 0;
  f.controller.attachModelSelector({ selectModel: async (request) => { calls++; return success({ selected: request }); } });
  await f.controller.refresh(); f.controller.setSession("no-profile-main"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); await f.controller.actions.applySession({ useProfileModel: true });
  assert.equal(calls, 0); assert.equal(f.controller.store.getSnapshot().session!.selection.selectedId, "p");
  assert.equal(f.controller.store.getSnapshot().sessionIssue!.code, "model-unconfigured");
  assert.equal(f.controller.store.getSnapshot().sessionNotice, null);
  f.controller.dispose();
});

test("selector withdrawal/replacement before profile acceptance forbids late native selection", async () => {
  const accepted = deferred<RemoteResult<SessionProfileSnapshot>>(); const f = fixture({ selectSession: async () => accepted.promise });
  let oldCalls = 0, newCalls = 0;
  f.controller.attachModelSelector({ selectModel: async (request) => { oldCalls++; return success({ selected: request }); } });
  await f.controller.refresh(); f.controller.setSession("selector-withdrawn"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); const apply = f.controller.actions.applySession({ useProfileModel: true });
  f.controller.attachModelSelector(null);
  f.controller.attachModelSelector({ selectModel: async (request) => { newCalls++; return success({ selected: request }); } });
  accepted.resolve(success(appliedWithModel("selector-withdrawn"))); await apply;
  assert.equal(oldCalls, 0); assert.equal(newCalls, 0);
  assert.equal(f.controller.store.getSnapshot().session!.selection.selectedId, "p");
  assert.equal(f.controller.store.getSnapshot().sessionIssue!.code, "model-service-unavailable");
  f.controller.dispose();
});

test("stale current-session and disposal fences prevent post-CAS native model dispatch", async () => {
  for (const boundary of ["view", "dispose"] as const) {
    const accepted = deferred<RemoteResult<SessionProfileSnapshot>>(); const f = fixture({ selectSession: async () => accepted.promise }); let calls = 0;
    f.controller.attachModelSelector({ selectModel: async (request) => { calls++; return success({ selected: request }); } });
    await f.controller.refresh(); f.controller.setSession("old-native"); await settle(f.controller);
    f.controller.actions.chooseSessionProfile("p"); const apply = f.controller.actions.applySession({ useProfileModel: true });
    if (boundary === "view") { f.controller.setSession("new-native"); await settle(f.controller); }
    else f.controller.dispose();
    accepted.resolve(success(appliedWithModel("old-native"))); await apply;
    assert.equal(calls, 0);
    if (boundary === "view") assert.equal(f.controller.store.getSnapshot().session!.sessionId, "new-native");
    f.controller.dispose();
  }
});

test("later native Models-tab selection wins because explicit profile action never echoes or reselects a model", async () => {
  const calls: SessionSelectModelRequest[] = []; let nativeModel = "previous-native";
  const selector = { selectModel: async (request: SessionSelectModelRequest) => { calls.push(request); nativeModel = request.model; return success({ selected: request }); } };
  const f = fixture({ selectSession: async (id) => success(appliedWithModel(id)) }); f.controller.attachModelSelector(selector);
  await f.controller.refresh(); f.controller.setSession("manual-later"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); await f.controller.actions.applySession({ useProfileModel: true });
  assert.equal(nativeModel, "profile-main");
  await selector.selectModel({ sessionId: "manual-later" as SessionSelectModelRequest["sessionId"], provider: "native-manual", model: "manual-tab-later" });
  await f.controller.actions.refreshSession(); await f.controller.actions.refreshCatalog();
  assert.equal(nativeModel, "manual-tab-later"); assert.equal(calls.length, 2);
  assert.equal("selectedModel" in f.controller.store.getSnapshot(), false, "native projections, not a local model echo, own the picker");
  f.controller.dispose();
});

test("manual Models-tab choice while profile CAS is pending wins over a delayed explicit profile-model action", async () => {
  const accepted = deferred<RemoteResult<SessionProfileSnapshot>>(); const f = fixture({ selectSession: async () => accepted.promise });
  let nativeModel = "old-native", calls = 0;
  f.controller.attachModelSelector({ selectModel: async (request) => { calls++; nativeModel = request.model; return success({ selected: request }); } });
  await f.controller.refresh(); f.controller.setSession("manual-during-cas"); await settle(f.controller);
  f.controller.actions.chooseSessionProfile("p"); const apply = f.controller.actions.applySession({ useProfileModel: true });
  nativeModel = "manual-tab-later";
  f.modelObservation.change({ lastUsed: null, next: { provider: "native-manual", model: nativeModel } });
  accepted.resolve(success(appliedWithModel("manual-during-cas"))); await apply;
  assert.equal(nativeModel, "manual-tab-later", "a delayed profile action must not overwrite the newer native choice");
  assert.equal(calls, 0);
  assert.equal(f.controller.store.getSnapshot().session!.selection.selectedId, "p");
  assert.equal(f.controller.store.getSnapshot().sessionIssue!.code, "model-choice-changed");
  f.controller.dispose();
});

test("projection invalidation and not-yet-notified frame unit seams fence optional model dispatch", async () => {
  for (const change of ["same-value-new-sequence", "pending-next-frame"] as const) {
    const accepted = deferred<RemoteResult<SessionProfileSnapshot>>(); const f = fixture({ selectSession: async () => accepted.promise }); let calls = 0;
    f.controller.attachModelSelector({ selectModel: async (request) => { calls++; return success({ selected: request }); } });
    await f.controller.refresh(); f.controller.setSession("projection-race"); await settle(f.controller);
    f.controller.actions.chooseSessionProfile("p"); const apply = f.controller.actions.applySession({ useProfileModel: true });
    if (change === "same-value-new-sequence") f.modelObservation.invalidate();
    else f.modelObservation.change({ lastUsed: { provider: "native", model: "current-native" }, next: { provider: "pending-native", model: "pending-model-choice" } }, false);
    accepted.resolve(success(appliedWithModel("projection-race"))); await apply;
    assert.equal(calls, 0); assert.equal(f.controller.store.getSnapshot().session!.selection.selectedId, "p");
    assert.equal(f.controller.store.getSnapshot().sessionIssue!.code, "model-choice-changed");
    f.controller.dispose();
  }
});

test("missing or withdrawn native model-selection observation refuses only the optional model stage", async () => {
  for (const timing of ["missing", "withdrawn"] as const) {
    const accepted = deferred<RemoteResult<SessionProfileSnapshot>>(); const f = fixture({ selectSession: async () => accepted.promise }); let calls = 0;
    f.controller.attachModelSelector({ selectModel: async (request) => { calls++; return success({ selected: request }); } });
    await f.controller.refresh(); f.controller.setSession("observation-boundary"); await settle(f.controller);
    if (timing === "missing") f.controller.attachModelSelectionSource(null, null);
    f.controller.actions.chooseSessionProfile("p"); const apply = f.controller.actions.applySession({ useProfileModel: true });
    if (timing === "withdrawn") f.controller.attachModelSelectionSource(null, null);
    accepted.resolve(success(appliedWithModel("observation-boundary"))); await apply;
    assert.equal(calls, 0); assert.equal(f.controller.store.getSnapshot().session!.selection.selectedId, "p");
    assert.equal(f.controller.store.getSnapshot().sessionIssue!.code, "model-observation-unavailable");
    assert.equal(f.controller.store.getSnapshot().sessionNotice, null);
    f.controller.dispose();
  }
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
