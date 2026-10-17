import { createRequire, registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { after } from "node:test";
import ts from "typescript";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import type { DsmmInvocationView, RoleControlAvailability } from "../src/role-control-types.ts";

const sdk = createRequire(process.env.DSMM_TEST_DSH_ENTRY ?? import.meta.url);
const sourceRoot = new URL("../src/", import.meta.url).href;
let resolving = false;
// Exercise source without emitting shared lib/. Only the new decorator-bearing
// Host module needs in-memory TypeScript transformation.
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (!resolving && specifier.startsWith("@deepseek-ai/") && process.env.DSMM_TEST_DSH_ENTRY !== undefined) {
    resolving = true;
    try { return { url: pathToFileURL(sdk.resolve(specifier)).href, shortCircuit: true }; }
    finally { resolving = false; }
  }
  if (context.parentURL !== undefined && specifier.endsWith(".js")) {
    const url = new URL(specifier, context.parentURL).href;
    const source = url.slice(0, -3) + ".ts";
    if (url.startsWith(sourceRoot) && existsSync(new URL(source))) return { url: source, shortCircuit: true };
  }
  return next(specifier, context);
}, load(url, context, next) {
  if (url === new URL("../src/role-control-rpc.ts", import.meta.url).href) {
    return { format: "module", source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
      fileName: "role-control-rpc.ts",
    }).outputText, shortCircuit: true };
  }
  return next(url, context);
} });
after(() => hooks.deregister());

export const { remoteErrorOf } = await import("@deepseek-ai/dsh-typert-protocol");
export const { ROLE_CONTROL_REMOTE, parseChildSessionSnapshot } = await import("../src/role-control-remote.ts");
const { registerRoleControlRpc } = await import("../src/role-control-rpc.ts");
const { RoleRunRegistry } = await import("../src/role-runs.ts");
const { deliveryFixture, accepted, nativePng, gate } = await import("./delivery-runtime-fixture.ts");
export { accepted, nativePng, gate };
export const newEpoch = () => randomBytes(32).toString("hex");

export function refused(code: string, reason?: string) {
  return (error: unknown) => {
    const remote = remoteErrorOf(error);
    return remote?.code === "dsmm-children/refused" && remote.details.code === code && (reason === undefined || remote.details.reason === reason);
  };
}
const enabled: RoleControlAvailability = { enabled: true };
function projected(mode: DsmmInvocationView["mode"]): DsmmInvocationView {
  return { role: "dsmm-coding", label: "Native coding", level: "max", routeSource: "level", route: { provider: "fixture", model: "native" }, mode };
}

export async function controlDeliveryFixture(images = false) {
  const f = await deliveryFixture({ images });
  const registry = new RoleRunRegistry(f.ctx, {
    currentEpoch(parent, owner) { const ticket = f.runtime.authority.acquireParentTicket(parent); if (owner !== ticket.owner) throw new Error("foreign entry"); return ticket.parentEpoch; },
    canBackground() { return false; },
    teardown: { revokeParent: (parent, reason) => f.runtime.authority.revokeParent(parent, reason), disposeRun: run => run.dispose() },
  });
  let beforeObserve: (() => Promise<void>) | undefined;
  let roleEnabled = true, legacy = false, failObservation = false;
  const rpc = f.ctx.plugin({ name: "c3-delivery-controls", inject: ["typert", "connection"], apply(scope: Context) {
    registerRoleControlRpc(scope, {
      runtime: f.runtime, runs: registry,
      capabilities() { return { background: { enabled: false, reason: "jobs-unavailable" }, prompt: enabled, interrupt: enabled, images: images ? enabled : { enabled: false, reason: "unavailable" }, runtime: f.runtime.authority.view() }; },
      projectRun() { return projected("one-shot"); },
      async backgroundAvailability() { return { enabled: false, reason: "jobs-unavailable" }; },
      async observeChild(ticket, entry, signal) {
        await beforeObserve?.(); signal.throwIfAborted();
        if (failObservation) throw new Error("SECRET_TOKEN at C:/private-fixture/raw-session.jsonl");
        const original = f.evidence.get(entry.id)?.original;
        return { prompt: roleEnabled ? enabled : { enabled: false, reason: "role-disabled" }, interrupt: enabled,
          ...(entry.mode !== "continuable" ? {} : { invocation: legacy ? undefined : { ...projected("continuable"), childId: entry.id } }),
          ...(original === undefined ? {} : { evidence: {
            mode: legacy ? "legacy-conservative" as const : "captured" as const, parentAdmissionEpoch: ticket.parentEpoch,
            ...(legacy ? {} : { originalAdmissionEpoch: original.epoch }),
            provenFields: ["lineage", "role", "route"] as ("lineage" | "role" | "route")[],
            limitations: legacy ? [{ field: "git-write" as const, code: "missing-evidence" as const, effect: "capability-denied" as const }] : [],
          } }),
        };
      },
    });
  } });
  await rpc.await();
  const invoke = (method: string, args: Record<string, unknown>, signal?: AbortSignal) => f.ctx.typertGateway.invoke({ namespace: "dsmmChildren", method, args, peer: f.ctx.connection.browserPeer, ...(signal === undefined ? {} : { signal }) });
  const create = () => f.create(true, { epoch: newEpoch(), permitted: true });
  const publish = (parent: Agent, permitted = true) => {
    const previous = f.admissions.get(parent)!;
    const next = { epoch: newEpoch(), permitted };
    f.runtime.authority.prepareParentAdmission(parent, previous.epoch, next);
    f.runtime.authority.publishParentAdmission(parent, previous.epoch, next, () => f.admissions.set(parent, next));
    return next;
  };
  return { ...f, rpc, registry, invoke, create, publish,
    setBeforeObserve(fn: typeof beforeObserve) { beforeObserve = fn; },
    setRoleEnabled(value: boolean) { roleEnabled = value; }, setLegacy(value: boolean) { legacy = value; }, setFailObservation(value: boolean) { failObservation = value; } };
}

export async function controlRunFixture() {
  const { roleRunFixture } = await import("./role-run-fixture.ts");
  const f = await roleRunFixture();
  const next = { epoch: newEpoch(), permitted: true }, previous = f.admissions.get(f.parent)!;
  f.runtime.authority.prepareParentAdmission(f.parent, previous.epoch, next);
  f.runtime.authority.publishParentAdmission(f.parent, previous.epoch, next, () => f.admissions.set(f.parent, next));
  const { TypertRegistry } = await import("@deepseek-ai/dsh-typert-registry");
  const { TypertGatewayService } = await import("@deepseek-ai/dsh-api-gateway");
  const Connection = await import("@deepseek-ai/dsh-client-connection");
  const { CredentialProvider } = await import(pathToFileURL(sdk.resolve("@deepseek-ai/dsh-credentials")).href);
  const { RemoteAccessService } = await import(pathToFileURL(sdk.resolve("@deepseek-ai/dsh-api-remote-access")).href);
  class MemoryCredentials extends CredentialProvider {
    readonly records = new Map<string, unknown>();
    async modifyRecord(key: string, modify: (current: unknown) => Promise<unknown>) { const next = await modify(this.records.get(key)); if (next !== undefined) this.records.set(key, next); return this.records.get(key); }
  }
  await f.ctx.plugin(RemoteAccessService).await();
  await f.ctx.plugin(TypertRegistry).await();
  await f.ctx.plugin(TypertGatewayService, {}).await();
  await f.ctx.plugin(MemoryCredentials).await();
  let connectionFiber = f.ctx.plugin(Connection);
  await connectionFiber.await();
  for (const registration of f.ctx.registry.values()) for (const fiber of registration.fibers) if ("connection" in fiber.inject || "typert" in fiber.inject) await fiber.await();
  let beforeBackground: (() => Promise<void>) | undefined;
  const rpc = f.ctx.plugin({ name: "c3-run-controls", inject: ["typert", "connection"], apply(scope: Context) {
    registerRoleControlRpc(scope, {
      runtime: f.runtime, runs: f.registry,
      capabilities() { return { background: enabled, prompt: enabled, interrupt: enabled, images: { enabled: false, reason: "unavailable" }, runtime: f.runtime.authority.view() }; },
      projectRun() { return projected("one-shot"); },
      async backgroundAvailability(_ticket, _identity, signal) { await beforeBackground?.(); signal.throwIfAborted(); return enabled; },
      async observeChild(_ticket, entry) { return { prompt: enabled, interrupt: enabled,
        ...(f.runs.some(run => run.childId === entry.id) ? { invocation: { ...projected("one-shot"), childId: entry.id } } : {}) }; },
    });
  } });
  await rpc.await();
  const invoke = (method: string, args: Record<string, unknown>) => f.ctx.typertGateway.invoke({ namespace: "dsmmChildren", method, args, peer: f.ctx.connection.browserPeer });
  return { ...f, rpc, invoke, connectionFiber,
    setBeforeBackground(fn: typeof beforeBackground) { beforeBackground = fn; },
    async replaceConnection() {
      await connectionFiber.dispose(); connectionFiber = f.ctx.plugin(Connection); await connectionFiber.await();
      for (const registration of f.ctx.registry.values()) for (const fiber of registration.fibers) if ("connection" in fiber.inject) await fiber.await();
    },
  };
}
