import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition, ToolExecution } from "@deepseek-ai/dsh-tools";
import { WebRuntime } from "@deepseek-ai/dsh-web";
import type { PreparedWebFetch, WebFetchRequest } from "@deepseek-ai/dsh-web";
import { HttpFetchProvider } from "@deepseek-ai/dsh-web-fetch-http";
import { FakeIpHttpFetchProvider } from "./web-fetch-fakeip.js";
import { permissionOriginal } from "./permission-control.js";
import type { TemporaryFileOptions } from "./permission-temporary-files.js";
import type { TemporaryPermissionExecution, TemporaryPermissionGrants } from "./permission-temporary-grants.js";
interface Prepared {
  readonly capability: PreparedWebFetch; readonly execution: TemporaryPermissionExecution;
  readonly signal: AbortSignal; readonly lease?: Awaited<ReturnType<TemporaryPermissionGrants["approve"]>>;
}
interface Registration {
  readonly scope: Context; readonly web: WebRuntime; readonly definition: ToolDefinition;
  readonly lifetime: AbortController; readonly pending: Map<ToolExecution["token"], Prepared>; readonly bypass: Set<ToolExecution["token"]>;
}
const registrations = new WeakMap<ToolDefinition, Registration>();
const running = new AsyncLocalStorage<{ registration: Registration; prepared: Prepared }>();
function supported(provider: object): boolean {
  const prototype = Object.getPrototypeOf(provider);
  return (prototype === HttpFetchProvider.prototype || prototype === FakeIpHttpFetchProvider.prototype)
    && Reflect.get(provider, "fetch") === prototype.fetch && Reflect.get(provider, "available") === prototype.available;
}
/** Captures only the native Web Fetch definition; search remains unchanged. */
export function temporaryWebToolScope(scope: Context): Context {
  const web = scope.get("web"), tools = scope.tools;
  if (!web || Object.getPrototypeOf(permissionOriginal(web)) !== WebRuntime.prototype || typeof web.prepareFetch !== "function" || typeof web.fetchPrepared !== "function") return scope;
  const facade = new Proxy(web, { get(target, key) {
    if (key === "fetch") return (request: WebFetchRequest, signal?: AbortSignal) => {
      const active = running.getStore();
      if (!active || active.registration.web !== web) return target.fetch(request, signal);
      const { prepared } = active;
      if (request.url !== prepared.capability.request.url || signal !== prepared.signal) throw new Error("Native fetch request changed.");
      return target.fetchPrepared(prepared.capability, { signal: AbortSignal.any([prepared.signal, prepared.execution.signal]), beforeDispatch() {
        prepared.execution.assertIntegrity(); prepared.lease?.consume();
      } });
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const toolFacade = new Proxy(tools, { get(target, key) {
    if (key !== "register") { const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; }
    return (native: ToolDefinition) => {
      if (native.name !== "web_fetch") return tools.register(native);
      const body = native.execute;
      const definition: ToolDefinition = { ...native, async execute(args, exec) {
        const prepared = registration.pending.get(exec.token);
        if (!prepared) {
          const controller = scope.get("dsmmTemporaryWebPermissions");
          if (controller && !controller.aborted && !registration.bypass.delete(exec.token)) throw new Error("Controlled fetch preparation did not complete.");
          return body(args, exec);
        }
        try {
          prepared.execution.assertIntegrity(); prepared.lease?.check();
          return await running.run({ registration, prepared }, () => body(args, exec));
        } finally { prepared.lease?.finish(); registration.pending.delete(exec.token); }
      } };
      const registration: Registration = { scope, web, definition, lifetime: new AbortController(), pending: new Map(), bypass: new Set() };
      registrations.set(definition, registration);
      const unregister = tools.register(definition);
      return scope.effect(() => () => {
        registration.lifetime.abort(); registrations.delete(definition);
        for (const prepared of registration.pending.values()) prepared.lease?.finish();
        registration.pending.clear(); unregister();
      });
    };
  } });
  return scope.extend({ web: facade, tools: toolFacade });
}

export function installTemporaryWebPermissions(ctx: Context, options: TemporaryFileOptions): () => void {
  const lifetime = new AbortController(), active = new Set<Registration>();
  ctx.provide("dsmmTemporaryWebPermissions", lifetime.signal);
  const pre = ctx.on("tools/pre-execute", async (exec, next) => {
    const definition = ctx.tools.get(exec.name, exec.agent), registration = definition && registrations.get(definition);
    if (!registration || !exec.agent) return next();
    const decision = await next();
    if (decision.kind === "deny" || decision.kind === "cancel") return decision;
    active.add(registration);
    const args = exec.arguments as { url: string };
    let url: URL;
    try { url = new URL(args.url); } catch { registration.bypass.add(exec.token); return decision; }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) { registration.bypass.add(exec.token); return decision; }
    await options.refresh?.();
    const authority = options.capture(exec), { web, scope } = registration;
    const original = permissionOriginal(web), body = definition.execute, argsJson = JSON.stringify(args);
    const prepare = Reflect.get(original, "prepareFetch"), fetchPrepared = Reflect.get(original, "fetchPrepared");
    const capability = web.prepareFetch({ url: args.url });
    const signal = AbortSignal.any([exec.signal, authority.sessionSignal, lifetime.signal, registration.lifetime.signal]);
    const check = () => {
      signal.throwIfAborted(); authority.assertIntegrity();
      const current = scope.get("web");
      if (!current || permissionOriginal(current) !== original || Reflect.get(original, "prepareFetch") !== prepare || Reflect.get(original, "fetchPrepared") !== fetchPrepared
        || prepare !== WebRuntime.prototype.prepareFetch || fetchPrepared !== WebRuntime.prototype.fetchPrepared
        || ctx.tools.get(exec.name, exec.agent) !== definition || definition.execute !== body || JSON.stringify(exec.arguments) !== argsJson)
        throw new Error("Native fetch execution changed.");
    };
    check(); authority.assertProgramAllowed();
    const execution: TemporaryPermissionExecution = { token: exec.token, agent: exec.agent, owner: authority.owner, generation: authority.generation,
      registration: definition, provider: capability.registration, sessionId: exec.agent.id, tool: exec.name,
      project: exec.agent.session.header.cwd ?? "", target: url.origin, summary: `web_fetch: ${url.origin}; native provider restrictions remain in effect.`,
      reusable: supported(capability.provider), signal, sessionSignal: authority.sessionSignal, assertIntegrity: check,
      assertReusable() {
        check(); authority.assertProgramAllowed(); authority.assertRetentionAllowed?.();
        const approval = scope.get("approval");
        if (!supported(capability.provider) || !approval || (approval.overrideOf(exec.agent!.session) ?? approval.config.policy ?? "ask") !== "ask")
          throw new Error("Native fetch permission is no longer reusable.");
      } };
    const lease = decision.kind === "ask" ? await options.grants.approve({ agent: exec.agent, callId: exec.callId, toolName: exec.name, signal,
      reason: `${decision.reason}\n${execution.summary}` }, execution) : undefined;
    registration.pending.set(exec.token, { capability, execution, signal: exec.signal, lease });
    return { kind: "allow" };
  }, { prepend: true, global: true });
  const result = ctx.on("tools/result", exec => { for (const registration of active) {
    registration.pending.get(exec.token)?.lease?.finish(); registration.pending.delete(exec.token); registration.bypass.delete(exec.token);
  } }, { global: true });
  return ctx.effect(() => () => { lifetime.abort(); pre(); result(); for (const registration of active) {
    for (const prepared of registration.pending.values()) prepared.lease?.finish(); registration.pending.clear();
  } active.clear(); });
}
declare module "@deepseek-ai/cordis" { interface Context { dsmmTemporaryWebPermissions: AbortSignal } }
