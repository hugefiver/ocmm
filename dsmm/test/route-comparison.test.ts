import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "@deepseek-ai/cordis";
import type { DsmmRoleRouteComparison as CapturedRouteComparison } from "../src/role-subagents.ts";
import type { DsmmInvocationView, DsmmRoleRouteComparison } from "../src/profile-types.ts";
import type { ChildSessionSnapshot, RoleControlChildView, RoleControlDescendantsSnapshot } from "../src/role-control-types.ts";
import type { RoleControlChildObservation } from "../src/role-control-rpc.ts";
import type { RoleRunInvocation } from "../src/role-runs.ts";
import { controlDeliveryFixture, gate, refused, remoteErrorOf, ROLE_CONTROL_REMOTE } from "./role-control-fixture.ts";

const { parseDsmmInvocationView, parseDsmmRoleRouteComparison } = await import("../src/profile-remote.ts");
const { parseChildSessionSnapshot, parseRoleControlDescendants, ROLE_CONTROL_HOST } = await import("../src/role-control-remote.ts");
const { registerRoleControlRpc } = await import("../src/role-control-rpc.ts");
const { ToolCallId } = await import("@deepseek-ai/dsh-llm");

const enabled = { enabled: true } as const;
const epoch = "a".repeat(64);
function knownComparison(childId = "child"): CapturedRouteComparison {
  return { childId,
    initialRoute: { status: "known", source: "invocation-capture", route: { provider: "fixture", model: "capture/model-v1", reasoningEffort: "max" } },
    liveRoute: { status: "known", source: "own-native-request-header", route: { provider: "fixture:live", model: "live/model-v2", reasoningEffort: "adaptive" } } };
}
function invocation(childId?: string, mode: DsmmInvocationView["mode"] = "continuable", routeComparison?: DsmmRoleRouteComparison): DsmmInvocationView {
  return { role: "dsmm-coding", label: "Coding", level: "max", routeSource: "level", route: { provider: "fixture", model: "unchanged-route" }, mode,
    ...(childId === undefined ? {} : { childId }), ...(routeComparison === undefined ? {} : { routeComparison }) };
}
function child(routeComparison?: DsmmRoleRouteComparison): RoleControlChildView {
  return { id: "child", parentSessionId: "root", mode: "continuable", activity: "inactive", readonly: false,
    controls: { prompt: enabled, interrupt: enabled }, ...(routeComparison === undefined ? {} : { routeComparison }) };
}
function snapshot(row: RoleControlChildView): ChildSessionSnapshot {
  return { sessionId: "root", admissionEpoch: epoch, runs: [], children: [row], capabilities: {
    background: enabled, prompt: enabled, interrupt: enabled, images: enabled,
    runtime: { binding: "dsmm", deliveryFenceReady: true, restartRequired: false } } };
}
function descendants(row: RoleControlChildView): RoleControlDescendantsSnapshot {
  return { sessionId: "root", admissionEpoch: epoch, descendants: [{ kind: "child", depth: 1, hasChildren: false, child: row }] };
}
function resultParsers(method: "describe" | "descendants") {
  return [ROLE_CONTROL_REMOTE.descriptors, ROLE_CONTROL_HOST.invocations].map(descriptors => {
    const codec = descriptors.find(entry => entry.method === method)!.result;
    assert.equal(codec.mode, "strict");
    if (codec.mode !== "strict") throw new Error("strict result codec required");
    return codec.create().parse;
  });
}

test("comparison codecs preserve distinct captured/live routes and leave existing invocation route semantics unchanged", () => {
  const comparison: DsmmRoleRouteComparison = knownComparison();
  assert.deepEqual(parseDsmmRoleRouteComparison(comparison), comparison);
  const view = invocation("child", "continuable", comparison);
  assert.deepEqual(parseDsmmInvocationView(view), view);
  assert.notDeepEqual(view.route, comparison.initialRoute.status === "known" ? comparison.initialRoute.route : undefined);
  const row = { ...child(comparison), invocation: view };
  assert.deepEqual(parseChildSessionSnapshot(snapshot(row)), snapshot(row));
  assert.deepEqual(parseRoleControlDescendants(descendants(row)), descendants(row));
  for (const parse of resultParsers("describe")) assert.deepEqual(parse(snapshot(row)), snapshot(row));
  for (const parse of resultParsers("descendants")) assert.deepEqual(parse(descendants(row)), descendants(row));
});

test("pre-request, invalid latest header and unobserved routes stay unknown; legacy comparison needs no fake invocation level", () => {
  for (const reason of ["no-own-request-header", "invalid-own-request-header", "not-observed"] as const) {
    const comparison: DsmmRoleRouteComparison = { ...knownComparison(), liveRoute: { status: "unknown", reason } };
    const view = invocation("child", "continuable", comparison);
    assert.deepEqual(parseDsmmInvocationView(view), view);
    assert.deepEqual(parseDsmmRoleRouteComparison(comparison).liveRoute, { status: "unknown", reason });
  }
  const comparison: DsmmRoleRouteComparison = { ...knownComparison(), initialRoute: { status: "unknown", reason: "missing-invocation-capture" } };
  const row: RoleControlChildView = { ...child(comparison), evidence: { mode: "legacy-conservative", parentAdmissionEpoch: epoch, provenFields: ["lineage", "route"], limitations: [] } };
  const parsed = parseChildSessionSnapshot(snapshot(row)).children[0];
  assert.deepEqual(parsed, row);
  assert.equal(Object.hasOwn(parsed, "invocation"), false);
  assert.equal(Object.hasOwn(parsed, "level"), false);
  const old = invocation();
  assert.deepEqual(parseDsmmInvocationView(old), old);
  assert.equal(Object.hasOwn(parseDsmmInvocationView(old), "routeComparison"), false);
  for (const parse of resultParsers("describe")) assert.deepEqual(parse(snapshot(child())), snapshot(child()));
  for (const parse of resultParsers("descendants")) assert.deepEqual(parse(descendants(child())), descendants(child()));
});

test("closed comparison grammar rejects secrets, arrays, unknown enums and enum objects on browser and Host codecs", () => {
  const known = knownComparison();
  assert.equal(known.initialRoute.status, "known"); assert.equal(known.liveRoute.status, "known");
  if (known.initialRoute.status !== "known" || known.liveRoute.status !== "known") throw new Error("known fixture required");
  const invalid: unknown[] = [
    [], { ...known, childId: "" }, { initialRoute: known.initialRoute, liveRoute: known.liveRoute },
    { ...known, apiKey: "SECRET_COMPARISON" },
    { ...known, initialRoute: [] }, { ...known, liveRoute: [] },
    { ...known, initialRoute: { ...known.initialRoute, route: [] } },
    { ...known, liveRoute: { ...known.liveRoute, route: [] } },
    { ...known, initialRoute: { ...known.initialRoute, route: { ...known.initialRoute.route, apiKey: "SECRET_CAPTURE" } } },
    { ...known, liveRoute: { ...known.liveRoute, route: { ...known.liveRoute.route, credentials: { token: "SECRET_LIVE" } } } },
    { ...known, initialRoute: { ...known.initialRoute, source: "profile" } },
    { ...known, liveRoute: { ...known.liveRoute, source: "parent-request-header" } },
    { ...known, initialRoute: { ...known.initialRoute, status: ["known"] } },
    { ...known, liveRoute: { ...known.liveRoute, source: { value: "own-native-request-header" } } },
    { ...known, liveRoute: { ...known.liveRoute, source: new String("own-native-request-header") } },
    { ...known, initialRoute: { status: "unknown", reason: "not-observed" } },
    { ...known, initialRoute: { status: "unknown", reason: ["missing-invocation-capture"] } },
    { ...known, liveRoute: { status: "unknown", reason: "profile-fallback" } },
    { ...known, liveRoute: { status: "unknown", reason: { value: "not-observed" } } },
    { ...known, liveRoute: { status: "unknown", reason: "invalid-own-request-header", route: known.liveRoute.route } },
    { ...known, initialRoute: { ...known.initialRoute, reason: "missing-invocation-capture" } },
  ];
  for (const comparison of invalid) {
    assert.throws(() => parseDsmmRoleRouteComparison(comparison), TypeError);
    assert.throws(() => parseDsmmInvocationView({ ...invocation("child"), routeComparison: comparison }), TypeError);
    const row = { ...child(), routeComparison: comparison };
    assert.throws(() => parseChildSessionSnapshot(snapshot(row as RoleControlChildView)), TypeError);
    assert.throws(() => parseRoleControlDescendants(descendants(row as RoleControlChildView)), TypeError);
    for (const parse of resultParsers("describe")) assert.throws(() => parse(snapshot(row as RoleControlChildView)), TypeError);
    for (const parse of resultParsers("descendants")) assert.throws(() => parse(descendants(row as RoleControlChildView)), TypeError);
  }
  let accessed = false;
  assert.throws(() => parseDsmmRoleRouteComparison({ ...known, get liveRoute() { accessed = true; return known.liveRoute; } }), TypeError);
  assert.equal(accessed, false);
});

test("comparison requires exact child identity on invocation, child catalog and real-run DTOs", () => {
  const known = knownComparison();
  for (const view of [invocation(undefined, "continuable", known), invocation("foreign", "continuable", known)]) {
    assert.throws(() => parseDsmmInvocationView(view), TypeError);
  }
  const row = { ...child(), routeComparison: knownComparison("foreign") };
  for (const parse of resultParsers("describe")) assert.throws(() => parse(snapshot(row)), TypeError);
  for (const parse of resultParsers("descendants")) assert.throws(() => parse(descendants(row)), TypeError);
  const run = { sessionId: "root", toolCallId: "call", state: "running", background: enabled,
    invocation: { ...invocation("child", "one-shot", known), runId: "native-run" } };
  for (const parse of resultParsers("describe")) {
    const value = { ...snapshot(child()), runs: [run] };
    assert.deepEqual(parse(value), value);
    assert.throws(() => parse({ ...value, runs: [{ ...run, invocation: { ...run.invocation, childId: "foreign" } }] }), TypeError);
    const { childId: _childId, ...missingId } = run.invocation;
    assert.throws(() => parse({ ...value, runs: [{ ...run, invocation: missingId }] }), TypeError);
  }
});

async function comparisonDeliveryFixture(observe: (childId: string, parentEpoch: string) => RoleControlChildObservation,
  projectRun: (identity: RoleRunInvocation<unknown, unknown>) => DsmmInvocationView = () => invocation(undefined, "one-shot")) {
  const f = await controlDeliveryFixture();
  await f.rpc.dispose();
  const rpc = f.ctx.plugin({ name: "comparison-child-controls", inject: ["typert", "connection"], apply(scope: Context) {
    registerRoleControlRpc(scope, { runtime: f.runtime, runs: f.registry,
      capabilities() { return { background: { enabled: false, reason: "jobs-unavailable" }, prompt: enabled, interrupt: enabled, images: enabled, runtime: f.runtime.authority.view() }; },
      projectRun,
      async backgroundAvailability() { return { enabled: false, reason: "jobs-unavailable" }; },
      async observeChild(ticket, entry) { return observe(entry.id, ticket.parentEpoch); } });
  } });
  await rpc.await();
  return { ...f, rpc };
}

test("Gateway passes collaborator comparisons through both child queries without capture, level or live fallback", { timeout: 20000 }, async () => {
  let project: (childId: string, parentEpoch: string) => RoleControlChildObservation = id => ({ prompt: enabled, interrupt: enabled,
    invocation: invocation(id, "continuable", knownComparison(id)), routeComparison: knownComparison(id) });
  const f = await comparisonDeliveryFixture((id, parentEpoch) => project(id, parentEpoch));
  const held = gate(); f.adapter.beforeStream = () => held.promise;
  try {
    const root = await f.create(), started = await f.start(root), id = started.childId;
    for (const method of ["describe", "descendants"] as const) {
      const result = await f.invoke(method, { sessionId: root.id }) as ChildSessionSnapshot | RoleControlDescendantsSnapshot;
      const rows = "children" in result ? result.children : result.descendants.flatMap(entry => entry.kind === "child" ? [entry.child] : []);
      assert.deepEqual(rows[0].routeComparison, knownComparison(id));
      assert.deepEqual(rows[0].invocation?.routeComparison, knownComparison(id));
      assert.equal(rows[0].invocation?.route?.model, "unchanged-route");
    }
    for (const reason of ["no-own-request-header", "invalid-own-request-header", "not-observed"] as const) {
      const comparison: DsmmRoleRouteComparison = { ...knownComparison(id), liveRoute: { status: "unknown", reason } };
      project = () => ({ prompt: enabled, interrupt: enabled, routeComparison: comparison });
      const view = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
      assert.deepEqual(view.children[0].routeComparison, comparison);
      assert.equal(view.children[0].invocation, undefined);
    }
    const legacy: DsmmRoleRouteComparison = { ...knownComparison(id), initialRoute: { status: "unknown", reason: "missing-invocation-capture" } };
    project = (_id, parentEpoch) => ({ prompt: enabled, interrupt: enabled, routeComparison: legacy,
      evidence: { mode: "legacy-conservative", parentAdmissionEpoch: parentEpoch, provenFields: ["lineage", "route"], limitations: [] } });
    const view = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
    assert.deepEqual(view.children[0].routeComparison, legacy);
    assert.equal(Object.hasOwn(view.children[0], "invocation"), false);
    project = () => ({ prompt: enabled, interrupt: enabled });
    const old = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
    assert.equal(Object.hasOwn(old.children[0], "routeComparison"), false);
    const invalid: RoleControlChildObservation[] = [
      { prompt: enabled, interrupt: enabled, routeComparison: knownComparison("foreign") },
      { prompt: enabled, interrupt: enabled, invocation: invocation(undefined, "continuable", knownComparison(id)) },
      { prompt: enabled, interrupt: enabled, invocation: invocation("foreign", "continuable", knownComparison("foreign")) },
      { prompt: enabled, interrupt: enabled, routeComparison: { ...knownComparison(id), apiKey: "SECRET_RPC" } } as RoleControlChildObservation,
    ];
    for (const observation of invalid) {
      project = () => observation;
      for (const method of ["describe", "descendants"] as const) await assert.rejects(f.invoke(method, { sessionId: root.id }), error => {
        assert.equal(JSON.stringify(remoteErrorOf(error)).includes("SECRET_RPC"), false);
        return refused("unavailable")(error);
      });
    }
  } finally { held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("Gateway real-run projection retains comparison only from projectRun and rejects missing or foreign identity", { timeout: 20000 }, async () => {
  let project: (identity: RoleRunInvocation<unknown, unknown>) => DsmmInvocationView = () => invocation(undefined, "one-shot");
  const f = await comparisonDeliveryFixture(() => ({ prompt: enabled, interrupt: enabled }), identity => project(identity));
  const held = gate(), entered = gate();
  f.adapter.beforeStream = () => { entered.release(); return held.promise; };
  let starts = 0;
  try {
    const parent = await f.create();
    const holder = f.registry.start({ parent, owner: f.owner, sessionId: parent.id, toolCallId: ToolCallId("comparison-call"),
      admissionEpoch: f.admissions.get(parent)!.epoch, capture: {}, projection: {}, label: "Comparison run", callerAbort: new AbortController().signal,
      async start(signal) { starts++; return f.runtime.start("spawn", { parent, signal, prompt: [{ type: "text", text: "native one-shot comparison task" }] }); } });
    await holder.ready; await entered.promise;
    const id = holder.invocation!.childId; assert.ok(id);
    const old = await f.invoke("describe", { sessionId: parent.id }) as ChildSessionSnapshot;
    assert.equal(Object.hasOwn(old.runs[0].invocation!, "routeComparison"), false);
    project = identity => { assert.equal(identity.childId, id); return invocation(id, "one-shot", knownComparison(id)); };
    const view = await f.invoke("describe", { sessionId: parent.id }) as ChildSessionSnapshot;
    assert.deepEqual(view.runs[0].invocation?.routeComparison, knownComparison(id));
    assert.equal(view.runs[0].invocation?.route?.model, "unchanged-route");
    assert.equal(view.runs[0].invocation?.runId, holder.invocation!.runId);
    assert.equal(Object.hasOwn(view.children[0], "routeComparison"), false);
    for (const invalid of [invocation(undefined, "one-shot", knownComparison(id)), invocation("foreign", "one-shot", knownComparison(id)),
      invocation("foreign", "one-shot", knownComparison("foreign"))]) {
      project = () => invalid;
      await assert.rejects(f.invoke("describe", { sessionId: parent.id }), refused("unavailable"));
    }
    held.release(); await holder.drained;
    assert.equal(starts, 1);
    assert.equal(f.adapter.calls.length, 1);
  } finally { held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});
