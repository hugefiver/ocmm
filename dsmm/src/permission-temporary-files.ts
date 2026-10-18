import { AsyncLocalStorage } from "node:async_hooks";
import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";
import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition, ToolExecution } from "@deepseek-ai/dsh-tools";
import type { TemporaryPermissionExecution, TemporaryPermissionGrants } from "./permission-temporary-grants.js";
import type { ArgvPermissionAuthority } from "./permission-exec-argv.js";
import { effectiveArgvEnvironment } from "./permission-exec-argv.js";
import { permissionOriginal } from "./permission-control.js";

type Kind = "read" | "glob" | "grep" | "write" | "edit";
type Target = Awaited<ReturnType<LocalFileSystem["resolve"]>>;
interface Resource { readonly target: Target; readonly type: string; readonly policy: string; readonly environment: string; readonly subprocess?: object }
interface Prepared {
  readonly execution: TemporaryPermissionExecution; readonly target: Target;
  readonly lease?: Awaited<ReturnType<TemporaryPermissionGrants["approve"]>>;
  check(): void;
  checkTarget(target: Target, metadata?: boolean): Promise<void>;
  spawn(spec: Parameters<LocalSubprocessRuntime["spawn"]>[0]): void;
}
interface Registration {
  readonly scope: Context; readonly kind: Kind; readonly definition: ToolDefinition;
  readonly fs: LocalFileSystem; readonly subprocess?: Context["subprocess"];
  readonly lifetime: AbortController; readonly pending: Map<ToolExecution["token"], Prepared>;
  readonly bypass: Set<ToolExecution["token"]>;
}
const registrations = new WeakMap<ToolDefinition, Registration>();
const resources = new WeakMap<object, Resource>();
const running = new AsyncLocalStorage<{ registration: Registration; prepared: Prepared }>();
const operations = new Set(["stat", "readText", "streamText", "readBytes", "readByteRange", "listDir", "writeText", "editText"]);
const requireSearch = createRequire(createRequire(import.meta.url).resolve("@deepseek-ai/dsh-tool-fs-search"));

/** Called only around the actual native module's apply, before its definitions are registered. */
export function temporaryFileToolScope(scope: Context, module: "fs" | "fs-search"): Context {
  const fs = scope.get("fs"), subprocess = scope.get("subprocess"), tools = scope.tools;
  if (!fs || Object.getPrototypeOf(permissionOriginal(fs)) !== LocalFileSystem.prototype) return scope;
  if ([...operations, "resolve", "contains", "processPath"].some(key => Reflect.get(permissionOriginal(fs), key) !== Reflect.get(LocalFileSystem.prototype, key))) return scope;
  const local = fs as LocalFileSystem;
  const facade = new Proxy(fs, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof value !== "function") return value;
    if (typeof key !== "string" || !operations.has(key)) return value.bind(target);
    return async (...args: unknown[]) => {
      const active = running.getStore();
      if (active?.registration.fs === local) { await active.prepared.checkTarget(args[0] as Target, key === "stat"); active.prepared.check(); }
      return Reflect.apply(value, target, args);
    };
  } });
  const processFacade = subprocess && new Proxy(subprocess, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key === "spawn") return (spec: Parameters<LocalSubprocessRuntime["spawn"]>[0]) => {
      const active = running.getStore();
      if (active?.registration.subprocess === subprocess) active.prepared.spawn(spec);
      return target.spawn(spec);
    };
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const toolFacade = new Proxy(tools, { get(target, key) {
    if (key !== "register") { const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; }
    return (native: ToolDefinition) => {
      const kind = native.name;
      if (!(module === "fs" ? ["read", "write", "edit"] : ["glob", "grep"]).includes(kind)) return tools.register(native);
      const body = native.execute;
      const definition: ToolDefinition = { ...native, async execute(args, exec) {
        const prepared = registration.pending.get(exec.token);
        if (!prepared) {
          const controller = scope.get("dsmmTemporaryFilePermissions");
          if (controller && !controller.aborted && !registration.bypass.delete(exec.token)) throw new Error("Controlled filesystem preparation did not complete.");
          return body(args, exec);
        }
        try {
          await prepared.checkTarget(prepared.target);
          prepared.check(); prepared.lease?.consume();
          return await running.run({ registration, prepared }, () => body(args, exec));
        } finally { prepared.lease?.finish(); registration.pending.delete(exec.token); }
      } };
      const registration: Registration = { scope, kind: kind as Kind, definition, fs: local, subprocess,
        lifetime: new AbortController(), pending: new Map(), bypass: new Set() };
      registrations.set(definition, registration);
      const unregister = tools.register(definition);
      return scope.effect(() => () => {
        registration.lifetime.abort(); registrations.delete(definition);
        for (const prepared of registration.pending.values()) prepared.lease?.finish();
        registration.pending.clear(); unregister();
      });
    };
  } });
  const overrides = { fs: facade, tools: toolFacade, ...processFacade ? { subprocess: processFacade } : {} };
  return scope.extend({ ...overrides, get: ((...args: Parameters<Context["get"]>) =>
    Object.hasOwn(overrides, args[0]) ? Reflect.get(overrides, args[0]) : Reflect.apply(scope.get, scope, args)) as Context["get"] });
}

export interface TemporaryFileOptions {
  readonly grants: TemporaryPermissionGrants;
  refresh?(): Promise<unknown>;
  capture(execution: Readonly<ToolExecution>): ArgvPermissionAuthority;
}
function inputPath(kind: Kind, args: Record<string, unknown>): string {
  const value = kind === "glob" || kind === "grep" ? args.path ?? "." : args.file_path;
  if (typeof value !== "string" || !value.length || value.includes("\0")) throw new TypeError("A concrete native filesystem target is required.");
  return value;
}
function searchArgv(kind: Kind, args: Record<string, unknown>, executable: string): string[] {
  if (typeof args.pattern !== "string" || !args.pattern.length) throw new TypeError("Invalid search pattern.");
  const parts = kind === "glob" ? ["--files", `--glob=${args.pattern}`, "--sort=modified", "--no-ignore", "--hidden",
    ...[".git", ".svn", ".hg", ".bzr", ".jj", ".sl"].flatMap(name => [`--glob=!**/${name}`, `--glob=!**/${name}/**`])]
    : ["--json", `--regexp=${args.pattern}`, ...args.include === undefined ? [] : [`--glob=${args.include}`]];
  return [executable, "--no-config", ...parts, ...args.path === undefined ? [] : ["--", String(args.path)]];
}

/** Native asks are settled once by the existing ApprovalService; providers remain the original ones. */
export function installTemporaryFilePermissions(ctx: Context, options: TemporaryFileOptions): () => void {
  const lifetime = new AbortController(), active = new Set<Registration>();
  ctx.provide("dsmmTemporaryFilePermissions", lifetime.signal);
  const pre = ctx.on("tools/pre-execute", async (exec, next) => {
    const definition = ctx.tools.get(exec.name, exec.agent), registration = definition && registrations.get(definition);
    if (!registration || !exec.agent) return next();
    const decision = await next();
    if (decision.kind === "deny" || decision.kind === "cancel") return decision;
    const { fs, kind, scope } = registration;
    active.add(registration);
    const args = exec.arguments as Record<string, unknown>;
    // Native escalation keeps its original once-only request and sandbox controller.
    if (args.sandbox_permissions !== undefined) { registration.bypass.add(exec.token); return decision; }
    const search = kind === "glob" || kind === "grep", mutation = kind === "write" || kind === "edit";
    const subprocess = registration.subprocess, originalFs = permissionOriginal(fs), originalProcess = subprocess && permissionOriginal(subprocess);
    if (search && (!originalProcess || Object.getPrototypeOf(originalProcess) !== LocalSubprocessRuntime.prototype
      || Reflect.get(originalProcess, "spawn") !== LocalSubprocessRuntime.prototype.spawn
      || "pkg" in process || process.versions.electron !== undefined)) { registration.bypass.add(exec.token); return decision; }
    await options.refresh?.();
    const authority = options.capture(exec), policyService = scope.get("sandboxPolicy");
    if (!policyService) { registration.bypass.add(exec.token); return decision; }
    const capturedPolicy = policyService.resolve({ session: exec.agent.session }), policy = JSON.stringify(capturedPolicy);
    const policyOwner = permissionOriginal(policyService), policyMethod = Reflect.get(policyOwner, "resolve"), sessionCwd = exec.agent.session.header.cwd;
    const input = inputPath(kind, args), argumentsJson = JSON.stringify(args), body = definition.execute;
    const methods = new Map([...operations, "resolve", "contains", "processPath"].map(key => [key, Reflect.get(originalFs, key)]));
    const spawn = originalProcess && Reflect.get(originalProcess, "spawn"), environment = search ? effectiveArgvEnvironment({}) : "";
    const signal = AbortSignal.any([exec.signal, authority.sessionSignal, registration.lifetime.signal, lifetime.signal]);
    const workingDirectory = scope.get("workingDirectory") as { ensure(agent: NonNullable<ToolExecution["agent"]>, signal: AbortSignal): Promise<string> } | undefined;
    if (!workingDirectory) throw new Error("Native working-directory service unavailable.");
    const cwd = await workingDirectory.ensure(exec.agent, signal);
    if (!isAbsolute(cwd) || !isAbsolute(capturedPolicy.workspaceRoot)) throw new Error("Absolute native filesystem coordinates required.");
    const root = await fs.resolve(capturedPolicy.workspaceRoot, { signal });
    const directory = await fs.resolve(cwd, { signal });
    const target = await fs.resolve(input, { cwd, signal }), info = await fs.stat(target, signal);
    const type = info?.type ?? "missing", path = fs.processPath(target);
    const parent = await fs.resolve(dirname(path), { signal });
    const executable = search ? (requireSearch("@vscode/ripgrep") as { rgPath: string }).rgPath : "";
    const expectedArgv = search ? searchArgv(kind, args, executable) : [];
    const check = () => {
      signal.throwIfAborted(); authority.assertIntegrity();
      const liveFs = scope.get("fs"), livePolicy = scope.get("sandboxPolicy");
      if (ctx.tools.get(exec.name, exec.agent) !== definition || definition.execute !== body || JSON.stringify(exec.arguments) !== argumentsJson
        || !liveFs || permissionOriginal(liveFs) !== originalFs || [...methods].some(([key, value]) => Reflect.get(originalFs, key) !== value)
        || !livePolicy || permissionOriginal(livePolicy) !== policyOwner || Reflect.get(policyOwner, "resolve") !== policyMethod
        || exec.agent!.session.header.cwd !== sessionCwd
        || JSON.stringify(policyService.resolve({ session: exec.agent!.session })) !== policy
        || search && (permissionOriginal(scope.subprocess) !== originalProcess || Reflect.get(originalProcess!, "spawn") !== spawn
          || effectiveArgvEnvironment({}) !== environment)) throw new Error("Native filesystem execution changed.");
      if (mutation && (capturedPolicy.mode === "read-only" || capturedPolicy.mode === "workspace-write" && !fs.contains(root, target))) throw new Error("The standing filesystem policy does not permit this mutation.");
      if (!["read-only", "workspace-write", "danger-full-access"].includes(capturedPolicy.mode)) throw new Error("Unsupported filesystem policy.");
    };
    check(); authority.assertProgramAllowed();
    const resource = Object.freeze({ target, type, policy, environment, subprocess: originalProcess }); resources.set(resource, resource);
    const execution: TemporaryPermissionExecution = { token: exec.token, agent: exec.agent, owner: authority.owner, generation: authority.generation,
      registration: definition, provider: originalFs, sessionId: exec.agent.id, tool: kind, project: capturedPolicy.workspaceRoot,
      target: JSON.stringify({ path, type, policy, environment }), resource,
      summary: `${kind}: ${path} (${search && type === "directory" ? "read tree" : mutation ? "write file" : "read file"}); native tool boundary only.`,
      reusable: true, signal, sessionSignal: authority.sessionSignal,
      scopes: [{ id: "tree", summary: `${kind}: ${mutation ? "write" : "read"} tree ${search && type === "directory" ? path : parent.displayPath}; native tool boundary only.`,
        allows(candidate) { const other = candidate.resource && resources.get(candidate.resource); return !!other && other.policy === policy && other.environment === environment && other.subprocess === originalProcess
          && fs.contains(search && type === "directory" ? target : parent, other.target); } }],
      assertIntegrity: check, assertReusable() {
        check(); authority.assertProgramAllowed(); authority.assertRetentionAllowed?.();
        const approval = scope.get("approval");
        if (!approval || (approval.overrideOf(exec.agent!.session) ?? approval.config.policy ?? "ask") !== "ask") throw new Error("Native approval policy no longer permits reuse.");
      } };
    const lease = decision.kind === "ask" ? await options.grants.approve({ agent: exec.agent, callId: exec.callId, toolName: exec.name, signal,
      reason: `${decision.reason}\n${execution.summary}` }, execution) : undefined;
    const prepared: Prepared = { execution, target, lease, check() { check(); lease?.check(); },
      async checkTarget(actual, metadata = false) {
        if (metadata && actual.targetKey === directory.targetKey) {
          const fresh = await fs.resolve(cwd, { signal }); prepared.check();
          if (fresh.targetKey !== directory.targetKey) throw new Error("Native working directory changed.");
          return;
        }
        const fresh = await fs.resolve(input, { cwd, signal }), currentInfo = await fs.stat(fresh, signal);
        prepared.check();
        if (actual.targetKey !== target.targetKey || fresh.targetKey !== target.targetKey || (currentInfo?.type ?? "missing") !== type) {
          throw new Error("Filesystem target changed before native handoff.");
        }
      },
      spawn(spec) {
        if (!search || JSON.stringify(spec.argv) !== JSON.stringify(expectedArgv) || spec.cwd !== cwd || spec.env !== undefined)
          throw new Error("Native search subprocess does not match the controlled template.");
        // Native rg awaits its helper and working-directory preparation before this synchronous handoff.
        const actual = realpathSync(resolve(spec.cwd, input)), actualType = statSync(actual).isDirectory() ? "directory" : "file";
        if (actual !== path || actualType !== type) throw new Error("Search and filesystem targets no longer share the execution world.");
        prepared.check();
      } };
    registration.pending.set(exec.token, prepared);
    return { kind: "allow" };
  }, { prepend: true, global: true });
  const result = ctx.on("tools/result", exec => {
    for (const registration of active) { registration.pending.get(exec.token)?.lease?.finish(); registration.pending.delete(exec.token); registration.bypass.delete(exec.token); }
  }, { global: true });
  return ctx.effect(() => () => { lifetime.abort(); pre(); result(); for (const registration of active) {
    for (const prepared of registration.pending.values()) prepared.lease?.finish(); registration.pending.clear();
  } active.clear(); });
}
declare module "@deepseek-ai/cordis" { interface Context { dsmmTemporaryFilePermissions: AbortSignal } }
