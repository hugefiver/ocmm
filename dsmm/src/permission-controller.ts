import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import { TOOL_ABORTED } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition, ToolExecution, ToolRunContext, ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { isSandboxWidening, PermissionControl, PermissionRefusal, permissionApprovalAdapter } from "./permission-control.js";
import type { PermissionControlCollaborators, PermissionRegistration } from "./permission-control.js";
import { classifyPermissionShell } from "./permission-shell.js";
import { nativeCommandMatch } from "./permission-native-command.js";
import type { PermissionShellIdentity } from "./permission-shell.js";
import { NATIVE_PERMISSION_CAPABILITIES, registerNativePermissionRules } from "./permission-native-rules.js";
import type { NativePermissionCapabilityView, NativePermissionFileSystem, NativePermissionToolIdentity } from "./permission-native-rules.js";
import type { PermissionRulesRuntimeSync } from "./permission-rules.js";
import { nativeStandingFullAccess } from "./permission-native-access.js";
import type { NativePermissionAccess } from "./permission-native-access.js";

export type ManagedPermissionShell = "bash" | "pwsh";
export type ManagedPermissionTool = "fs" | "fs-search" | "web";
type NativeToolKind = Exclude<NativePermissionToolIdentity["kind"], "shell">;
export const PERMISSION_CONTROLLER_INJECT = ["tools", "agents"] as const;
export interface PermissionControllerOptions {
  /** The existing live Core owner/admission/Root/realm/run facts, not serialized settings or a ready boolean. */
  readonly authority: PermissionControlCollaborators;
  readonly rules: PermissionRulesRuntimeSync;
  /** Native registration identity; only an explicit capability proves Shell read semantics. */
  shellIdentity(scope: Context, kind: ManagedPermissionShell): PermissionShellIdentity;
  coLocated?(scope: Context, execution: Readonly<ToolExecution>, fs: NativePermissionFileSystem): boolean;
}
interface ManagedRegistration {
  readonly kind: ManagedPermissionShell;
  readonly scope: Context;
  readonly registration: PermissionRegistration;
  readonly shell: PermissionShellIdentity;
  dispose(): void;
}
/** Minimal projection of the public Shell seam; all other spec/handle fields pass through. */
interface NativeShell {
  readonly sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  resolve(request: Record<string, unknown>): Record<string, unknown>;
  execute(spec: Record<string, unknown> & { sandboxPolicy?: { readonly mode: string } }): Promise<unknown>;
}
export interface ManagedPermissionShellCoverage {
  readonly name: string;
  readonly kind: ManagedPermissionShell;
  readonly boundary: "cooperative-body";
  readonly approval: "native-once";
}
export interface ManagedPermissionToolCoverage {
  readonly name: string;
  readonly kind: NativeToolKind;
  readonly boundary: "tool-call-boundary";
  readonly approval: "native-once";
  readonly pathEvidence: "native-fs" | "requires-colocation" | "not-applicable";
}
interface ManagedToolRegistration {
  readonly scope: Context;
  readonly definition: ToolDefinition;
  readonly kind: NativeToolKind;
  readonly signal: AbortSignal;
  unchanged(): boolean;
  dispose(): void;
}

/** Bind methods to the original scoped receiver, preserving filters and registry layers. */
function toolsFacade(tools: ToolRuntime, register: ToolRuntime["register"]): ToolRuntime {
  const methods = new Map<PropertyKey, { original: unknown; bound: unknown }>();
  return new Proxy(tools, { get: (_target, key) => {
    if (key === "register") return register;
    const value: unknown = Reflect.get(tools, key, tools);
    if (typeof value !== "function") return value;
    const previous = methods.get(key);
    if (previous?.original === value) return previous.bound;
    const bound = value.bind(tools); methods.set(key, { original: value, bound }); return bound;
  } });
}

function nativeToolKind(module: ManagedPermissionTool, name: string): NativeToolKind | undefined {
  if (module === "fs") return name === "read" ? "read" : undefined;
  if (module === "fs-search") return name === "glob" || name === "grep" ? name : undefined;
  return name === "web_search" ? "webSearch" : name === "web_fetch" ? "webFetch" : undefined;
}

function unchangedFields(value: object, previous: PropertyDescriptorMap): boolean {
  const current = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  return keys.length === Reflect.ownKeys(previous).length && keys.every(key => {
    const a = Reflect.get(current, key) as PropertyDescriptor | undefined, b = Reflect.get(previous, key) as PropertyDescriptor | undefined;
    return a !== undefined && b !== undefined && a.value === b.value && a.get === b.get && a.set === b.set
      && a.enumerable === b.enumerable && a.configurable === b.configurable && a.writable === b.writable;
  });
}

/** Ordinary module owner. Only registrations captured by native module façades are managed. */
export class DsmmPermissionController extends Service {
  readonly permissions: PermissionControl;
  readonly rules: PermissionRulesRuntimeSync;
  private readonly registrations = new Map<ToolDefinition, ManagedRegistration>();
  private readonly toolRegistrations = new Map<ToolDefinition, ManagedToolRegistration>();
  private readonly lifetime = new AbortController();
  constructor(ctx: Context, private readonly options: PermissionControllerOptions) {
    super(ctx, "dsmmPermissionController");
    this.rules = options.rules;
    const authority: PermissionControlCollaborators = {
      rootCurrent: options.authority.rootCurrent === undefined ? undefined : (root, exec) => options.authority.rootCurrent!(root, exec),
      captureIntegrity: options.authority.captureIntegrity === undefined ? undefined : exec => options.authority.captureIntegrity!(exec),
      current: exec => options.authority.current(exec),
      assertCurrent: (current, exec) => {
        options.authority.assertCurrent(options.authority.current(exec), exec);
        if (current.agent !== exec.agent || this.lifetime.signal.aborted) throw new PermissionRefusal("stale");
      },
    };
    this.permissions = new PermissionControl(ctx, authority);
    if (this.rules.status().mounted) {
      registerNativePermissionRules(ctx, {
        runtime: this.rules,
        captureIntegrity: options.authority.captureIntegrity === undefined ? undefined : exec => options.authority.captureIntegrity!(exec),
        identify: definition => {
          const managed = this.registrations.get(definition);
          if (managed === undefined) {
            const tool = this.toolRegistrations.get(definition);
            if (tool === undefined) return undefined;
            return { kind: tool.kind, context: tool.scope, signal: tool.signal,
              assertCurrent: () => { if (tool.signal.aborted || !tool.unchanged()) throw new PermissionRefusal("stale"); },
              assertIntegrity: () => { if (tool.signal.aborted || !tool.unchanged()) throw new PermissionRefusal("stale"); },
              coLocated: (exec, fs) => options.coLocated?.(tool.scope, exec, fs) === true };
          }
          return { kind: "shell", context: managed.scope, shell: managed.shell, signal: managed.registration.signal,
            assertIntegrity: () => { if (!managed.registration.active || !managed.registration.unchanged()) throw new PermissionRefusal("stale"); },
            assertCurrent: exec => managed.registration.assertCurrent?.(exec),
            coLocated: (exec, fs) => options.coLocated?.(managed.scope, exec, fs) === true };
        },
        captureAuthority: exec => {
          const current = options.authority.current(exec);
          return { signal: current.signal, assertCurrent: () => options.authority.assertCurrent(current, exec) };
        },
        assertCurrent: exec => authority.assertCurrent(authority.current(exec), exec),
        managedShellDecision: async (exec, action, downstream) => {
          const definition = ctx.tools.get(exec.name, exec.agent), managed = definition === undefined ? undefined : this.registrations.get(definition);
          if (managed === undefined) throw new PermissionRefusal("stale");
          const workspace = exec.agent?.session.header.cwd ?? "";
          const full = nativeStandingFullAccess(ctx, exec.agent);
          if (full) return this.permissions.compose(exec, managed.registration, undefined, "inherit", downstream, workspace);
          const policy = this.rules.getPolicy().policy;
          const entry = nativeCommandMatch(policy.nativeCommands, managed.kind, managed.shell, exec.arguments, workspace);
          if (entry === "ambiguous") managed.scope.logger.warn("Ambiguous native command sandbox modes; retaining native execution policy.");
          if (entry !== undefined && entry !== "ambiguous" && (managed.scope.get("shell") as NativeShell | undefined)?.sandboxMode === undefined) return { kind: "deny", reason: "Native command sandbox enhancement is unavailable in this executor." };
          const operation = classifyPermissionShell(managed.shell, exec.arguments, workspace, exec);
          return this.permissions.compose(exec, managed.registration, entry === "ambiguous" ? undefined : entry, action, downstream, operation.workingDirectory);
        },
      });
      ctx.tools.guard(exec => this.permissions.guard(exec));
      ctx.on("approval/request", permissionApprovalAdapter(ctx, (request, next) => this.permissions.answerer(request, next)), { prepend: true, global: true });
      ctx.on("tools/result", exec => { this.permissions.finish(exec); }, { global: true });
      ctx.on("agent/disposed", ({ agent }) => { this.permissions.revokeAgent(agent); }, { global: true });
    }
    ctx.effect(() => () => this.retire());
  }

  /** Public in-process facts for DSMM consumers; requested/configured modes never grant access. */
  nativeAccess(exec: Readonly<ToolExecution>): NativePermissionAccess {
    const mode = this.permissions.approvedTarget(exec);
    return Object.freeze({ standingFullAccess: nativeStandingFullAccess(this.ctx, exec.agent),
      ...mode === undefined ? {} : { approvedSandboxMode: mode } });
  }

  /** Optional public injection also captures definitions registered before Core publishes this service. */
  static toolScope(scope: Context, kind: ManagedPermissionTool): Context {
    const originalTools = scope.tools;
    return scope.extend({ tools: toolsFacade(originalTools, definition => {
      const mapped = nativeToolKind(kind, definition.name);
      if (mapped === undefined) return originalTools.register(definition);
      const unregister = originalTools.register(definition);
      const binding = scope.inject(["dsmmPermissionController"], injected => {
        injected.dsmmPermissionController.captureTool(injected, definition, mapped);
      });
      return scope.effect(() => () => { const disposing = binding.dispose(); unregister(); return disposing; });
    }) });
  }

  toolScope(scope: Context, kind: ManagedPermissionTool): Context {
    return DsmmPermissionController.toolScope(scope, kind);
  }

  private captureTool(scope: Context, definition: ToolDefinition, kind: NativeToolKind): void {
    if (!this.rules.status().mounted) return;
    if (this.lifetime.signal.aborted) throw new PermissionRefusal("unavailable");
    const fields = Object.getOwnPropertyDescriptors(definition), outputFields = Object.getOwnPropertyDescriptors(definition.output);
    const parameters = JSON.stringify(definition.parameters), outputSchema = JSON.stringify(definition.output.schema);
    const lifetime = new AbortController();
    const managed: ManagedToolRegistration = { scope, definition, kind,
      signal: AbortSignal.any([lifetime.signal, this.lifetime.signal]),
      unchanged: () => unchangedFields(definition, fields) && unchangedFields(definition.output, outputFields)
        && JSON.stringify(definition.parameters) === parameters && JSON.stringify(definition.output.schema) === outputSchema,
      dispose: () => { lifetime.abort(); if (this.toolRegistrations.get(definition) === managed) this.toolRegistrations.delete(definition); },
    };
    this.toolRegistrations.set(definition, managed);
    scope.effect(() => managed.dispose);
  }

  /** The receiver is captured before extend: do not register into an Agent's own layer. */
  shellScope(scope: Context, kind: ManagedPermissionShell): Context {
    if (!this.rules.status().mounted) return scope;
    if (this.lifetime.signal.aborted) throw new PermissionRefusal("unavailable");
    const originalTools = scope.tools, originalShell = scope.get("shell") as NativeShell | undefined, methods = new Map<PropertyKey, { original: unknown; bound: unknown }>();
    if (originalShell === undefined) throw new PermissionRefusal("unavailable");
    const register = (definition: ToolDefinition): (() => void) => this.registerShell(scope, originalTools, kind, definition);
    const facade = new Proxy(originalTools, { get: (_target, key) => {
      if (key === "register") return register;
      const value: unknown = Reflect.get(originalTools, key, originalTools);
      if (typeof value !== "function") return value;
      const previous = methods.get(key);
      if (previous?.original === value) return previous.bound;
      const bound = value.bind(originalTools); methods.set(key, { original: value, bound }); return bound;
    } });
    const shell = new Proxy(originalShell, { get: (_target, key) => {
      if (key === "resolve") return (request: Parameters<typeof originalShell.resolve>[0]) => Reflect.apply(originalShell.resolve, originalShell, [request]);
      if (key === "execute") return (spec: Parameters<typeof originalShell.execute>[0]) => {
        const mode = this.permissions.sandboxMode();
        if (mode !== undefined && spec.sandboxPolicy === undefined) throw new PermissionRefusal("unavailable");
        return Reflect.apply(originalShell.execute, originalShell, [mode === undefined || !isSandboxWidening(mode, spec.sandboxPolicy?.mode) ? spec : { ...spec, sandboxPolicy: { ...spec.sandboxPolicy, mode } }]);
      };
      const value: unknown = Reflect.get(originalShell, key, originalShell);
      return typeof value === "function" ? value.bind(originalShell) : value;
    } });
    // This façade only binds request provenance. The original service still applies never, audit and cancellation.
    const approval = (): Context["approval"] | undefined => {
      const original = scope.get("approval");
      if (original === undefined) return undefined;
      return new Proxy(original, { get: (_target, key) => {
        if (key === "request") return (request: Parameters<typeof original.request>[0]) => this.permissions.nativeApproval(request, original);
        const value: unknown = Reflect.get(original, key, original);
        return typeof value === "function" ? value.bind(original) : value;
      } });
    };
    // Native.apply resolves its optional approver with public Context.get, not the property getter.
    return scope.extend({ tools: facade, shell,
      get: ((...args: Parameters<Context["get"]>) => args[0] === "approval" ? approval() : Reflect.apply(scope.get, scope, args)) as Context["get"],
    });
  }

  private registerShell(scope: Context, originalTools: ToolRuntime, kind: ManagedPermissionShell, definition: ToolDefinition): () => void {
    if (this.lifetime.signal.aborted) throw new PermissionRefusal("unavailable");
    const identity = this.options.shellIdentity(scope, kind);
    if (identity.dialect !== (kind === "bash" ? "posix" : "powershell") || identity.commandField !== "command" || identity.cwdField !== "workdir" || identity.executable.length === 0) throw new PermissionRefusal("validation");
    const capability = identity.readCapability;
    const shell: PermissionShellIdentity = Object.freeze({ ...identity, readCapability: capability === undefined ? undefined : Object.freeze({
      signal: capability.signal, resolveExecutable: capability.resolveExecutable.bind(capability), assertCurrent: capability.assertCurrent.bind(capability),
    }) });
    const fields = Object.getOwnPropertyDescriptors(definition), body = definition.execute, lifetime = new AbortController();
    const parameters = JSON.stringify(definition.parameters), outputSchema = JSON.stringify(definition.output.schema);
    const outputFields = Object.getOwnPropertyDescriptors(definition.output), shellOwner = scope.get("shell"), sandboxPolicy = scope.get("sandboxPolicy");
    if (shellOwner === undefined) throw new PermissionRefusal("unavailable");
    let registration!: PermissionRegistration;
    const wrapper = async (args: unknown, exec: ToolRunContext): Promise<unknown> => {
      return this.permissions.run(exec, args, registration, async signal => {
        const value = await body.call(definition, args, Object.freeze({ ...exec, signal,
          deferContext: exec.deferContext.bind(exec), concludeTurn: exec.concludeTurn.bind(exec) }));
        if (signal.aborted) throw new HarnessError("Permission-controlled tool execution was cancelled.", TOOL_ABORTED);
        return value;
      });
    };
    const registered = Object.create(Object.getPrototypeOf(definition), { ...fields, execute: { ...fields.execute, value: wrapper } }) as ToolDefinition;
    const registeredFields = Object.getOwnPropertyDescriptors(registered);
    registration = { definition, registered, body, identity: Object.freeze({}), active: true,
      approval: () => scope.get("approval"),
      standingMode: exec => sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session }).mode,
      signal: AbortSignal.any([lifetime.signal, this.lifetime.signal]),
      assertCurrent: exec => {
        shell.readCapability?.assertCurrent(exec);
      },
      unchanged: () => unchangedFields(definition, fields) && unchangedFields(registered, registeredFields)
        && unchangedFields(definition.output, outputFields) && JSON.stringify(definition.parameters) === parameters && JSON.stringify(definition.output.schema) === outputSchema,
    };
    let unregister: (() => void) | undefined, disposed = false;
    const managed: ManagedRegistration = { kind, scope, registration, shell, dispose: () => {
      if (disposed) return; disposed = true;
      this.permissions.revokeRegistration(registration); lifetime.abort(); this.registrations.delete(registered);
      unregister?.();
    } };
    this.registrations.set(registered, managed);
    try { unregister = originalTools.register(registered); }
    catch (error) { this.permissions.revokeRegistration(registration); lifetime.abort(); this.registrations.delete(registered); throw error; }
    if (disposed) { unregister(); return () => {}; }
    return scope.effect(() => managed.dispose);
  }

  coverage(agent?: Agent): readonly ManagedPermissionShellCoverage[] {
    return Object.freeze([...this.registrations.values()].filter(managed => managed.registration.active
      && !managed.registration.signal?.aborted && managed.registration.unchanged()
      && this.ctx.tools.get(managed.registration.registered.name, agent) === managed.registration.registered).map(managed => Object.freeze({
         name: managed.registration.registered.name, kind: managed.kind, boundary: "cooperative-body" as const, approval: "native-once" as const,
      })));
  }
  /** Actual visible non-Shell registrations, not executor readiness or co-location proof. */
  toolCoverage(agent?: Agent): readonly ManagedPermissionToolCoverage[] {
    if (!this.rules.status().mounted || this.lifetime.signal.aborted) return Object.freeze([]);
    return Object.freeze([...this.toolRegistrations.values()].filter(managed => !managed.signal.aborted && managed.unchanged()
      && this.ctx.tools.get(managed.definition.name, agent) === managed.definition).map(managed => Object.freeze({
        name: managed.definition.name, kind: managed.kind, boundary: "tool-call-boundary" as const, approval: "native-once" as const,
        pathEvidence: managed.kind === "read" ? "native-fs" as const : managed.kind === "glob" || managed.kind === "grep" ? "requires-colocation" as const : "not-applicable" as const,
      })));
  }
  capabilities(agent?: Agent): NativePermissionCapabilityView {
    if (this.lifetime.signal.aborted) throw new PermissionRefusal("unavailable");
    return Object.freeze({ limits: NATIVE_PERMISSION_CAPABILITIES, runtime: this.rules.status(), tools: Object.freeze([
      ...this.coverage(agent).map(tool => Object.freeze({ name: tool.name, kind: "shell" as const, approval: tool.approval, scopedMemory: false as const })),
      ...this.toolCoverage(agent).map(tool => Object.freeze({ name: tool.name, kind: tool.kind, approval: tool.approval, scopedMemory: false as const })),
    ]) });
  }
  retire(): void {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort(); this.permissions.retire();
    for (const managed of [...this.registrations.values()]) managed.dispose();
    for (const managed of [...this.toolRegistrations.values()]) managed.dispose();
  }
}
declare module "@deepseek-ai/cordis" { interface Context { dsmmPermissionController: DsmmPermissionController } }
/** Parent supplies the real existing Core collaborators and A's sole runtime-sync owner. */
export function installPermissionController(ctx: Context, options: PermissionControllerOptions): DsmmPermissionController {
  if (ctx.get("dsmmPermissionController") !== undefined) throw new PermissionRefusal("unavailable");
  return new DsmmPermissionController(ctx, options);
}
