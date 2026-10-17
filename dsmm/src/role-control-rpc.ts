import { symbols } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
import type { SessionController } from "@deepseek-ai/dsh-api-session-controller";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { SubagentCatalogEntry } from "@deepseek-ai/dsh-subagent";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { Remote, RemoteError, TypertRemoteService, remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@deepseek-ai/dsh-typert-registry";
import { scopeLifetime } from "./delivery-authority.js";
import type { DeliveryAdmission, ParentAdmissionTicket } from "./delivery-authority.js";
import type { DsmmSubagentRuntime } from "./subagent-runtime.js";
import type { RoleRunHolder, RoleRunInvocation, RoleRunRegistry, RoleRunState } from "./role-runs.js";
import { ROLE_CONTROL_HOST, parseChildSessionSnapshot, parseRoleControlBackgroundRequest, parseRoleControlCapabilities, parseRoleControlDescendants, parseRoleControlErrorInfo, parseRoleControlInterruptRequest, parseRoleControlPromptRequest, parseRoleControlSessionId } from "./role-control-remote.js";
import { parseDsmmInvocationView, parseDsmmRoleRouteComparison } from "./profile-remote.js";
import type { BackgroundTransitionResult, ChildAdmissionEvidenceView, ChildSessionSnapshot, DsmmInvocationView, DsmmRoleRouteComparison, RoleControlAvailability, RoleControlBackgroundRequest, RoleControlCapabilities, RoleControlChildView, RoleControlDescendantsSnapshot, RoleControlErrorInfo, RoleControlInterruptRequest, RoleControlRunView, SubagentInterruptReceipt, SubagentPromptReceipt, SubagentPromptRequest } from "./role-control-types.js";

export interface RoleControlChildObservation {
  readonly invocation?: DsmmInvocationView;
  readonly routeComparison?: DsmmRoleRouteComparison;
  readonly evidence?: ChildAdmissionEvidenceView;
  readonly prompt: RoleControlAvailability;
  readonly interrupt: RoleControlAvailability;
}
/** Trusted Host adapters borrow captured B/C2b state, never wire claims or new settings. */
export interface RoleControlCollaborators<A extends DeliveryAdmission, E, C, P> {
  readonly runtime: DsmmSubagentRuntime<A, E>;
  readonly runs: RoleRunRegistry<C, P>;
  capabilities(ticket: ParentAdmissionTicket<A>): RoleControlCapabilities;
  projectRun(invocation: RoleRunInvocation<C, P>): DsmmInvocationView;
  backgroundAvailability(ticket: ParentAdmissionTicket<A>, invocation: RoleRunInvocation<C, P>, signal: AbortSignal): Promise<RoleControlAvailability>;
  /** Read-only evidence fold; must not resume/materialize a child. */
  observeChild(ticket: ParentAdmissionTicket<A>, child: SubagentCatalogEntry, signal: AbortSignal): Promise<RoleControlChildObservation>;
}
interface ControlScope<A extends DeliveryAdmission> {
  readonly parent: Agent;
  readonly ticket: ParentAdmissionTicket<A>;
  readonly signal: AbortSignal;
  check(): void;
}
class ControlRefusal extends Error {
  readonly info: RoleControlErrorInfo;
  constructor(code: RoleControlErrorInfo["code"], field?: RoleControlErrorInfo["field"], reason?: RoleControlErrorInfo["reason"]) {
    super("The Host refused the child control operation.");
    this.info = { code, ...(field === undefined ? {} : { field }), ...(reason === undefined ? {} : { reason }) };
  }
}
const disabled = (reason: Extract<RoleControlAvailability, { enabled: false }>["reason"]): RoleControlAvailability => ({ enabled: false, reason });
function requireEnabled(value: RoleControlAvailability): void { if (!value.enabled) throw new ControlRefusal("disabled", undefined, value.reason); }
function original(value: object): object { return Reflect.get(value, symbols.original) ?? value; }
function terminalTransition(state: RoleRunState, runId: string): BackgroundTransitionResult | undefined {
  return state === "settled" ? { status: "already-settled", runId } : state === "cancelled" ? { status: "cancelled", runId } : undefined;
}
function boundedChildLabel(label: string): string {
  const high = label.charCodeAt(119), low = label.charCodeAt(120);
  // Preserve the UTF-16 wire bound without splitting a valid native code point.
  const end = high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff ? 119 : 120;
  return label.slice(0, end).replace(/[\u0000-\u001f\u007f]/gu, " ");
}

/** Separate namespace: native inbox/jobs remain the sole execution owners. */
export class DsmmChildrenHost<A extends DeliveryAdmission, E, C, P> extends TypertRemoteService {
  private readonly lifetime = new AbortController();
  private readonly backgroundJobs = new WeakMap<RoleRunHolder<C, P>, string>();
  private readonly collaborators: RoleControlCollaborators<A, E, C, P>;

  constructor(ctx: Context, collaborators: RoleControlCollaborators<A, E, C, P>) {
    super(ctx, "dsmmChildren");
    this.collaborators = collaborators;
    scopeLifetime(ctx, "dsmm.children: close scoped controls", () => this.lifetime.abort());
  }

  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      let info: RoleControlErrorInfo;
      if (error instanceof ControlRefusal) info = error.info;
      else {
        const code = String(remoteErrorOf(error)?.code ?? (error instanceof SubagentError ? error.code : ""));
        if (["gateway/cancelled", "ABORTED"].includes(code) || error instanceof Error && error.name === "AbortError") info = { code: "cancelled" };
        else if (["subagent/unauthorized", "UNAUTHORIZED"].includes(code)) info = { code: "not-owned" };
        else if (["subagent/not-resumable", "NOT_RESUMABLE"].includes(code)) info = { code: "not-resumable", field: "childSessionId" };
        else if (code === "subagent/attachment-invalid" || code === "gateway/bad-request") info = { code: "invalid-content", field: "content" };
        else if (code === "subagent/invalid-time-zone") info = { code: "invalid-time-zone", field: "clientTimeZone" };
        else info = { code: "unavailable" };
      }
      // Do not forward SDK messages, details, causes, paths, content or secrets.
      throw new RemoteError("dsmm-children/refused", "The Host refused the child control operation.", parseRoleControlErrorInfo(info));
    }
  }

  private decode<T>(parse: (value: unknown) => T, value: unknown): T {
    try { return parse(value); } catch { throw new ControlRefusal("validation", "request"); }
  }

  private async scoped<T>(sessionId: string, readOnly: boolean, operation: (scope: ControlScope<A>) => Promise<T>): Promise<T> {
    const invocation = this.ctx.invocation;
    const connection = this.ctx.get("connection") as HostConnectionHandle | undefined;
    if (invocation?.peer === undefined || connection === undefined || connection.browserPeer !== invocation.peer) throw new ControlRefusal("not-owned");
    const connectionOwner = original(connection);
    const runtime = this.collaborators.runtime;
    if (!runtime.authority.view().deliveryFenceReady) throw new ControlRefusal("unavailable", undefined, "delivery-fence-unavailable");
    const browserSignal = runtime.authority.acquireBrowserSignal(this.ctx);
    const initialSignal = AbortSignal.any([invocation.signal, invocation.peer.signal, browserSignal, this.lifetime.signal]);
    const checkConnection = (): void => {
      if (initialSignal.aborted) throw new ControlRefusal("cancelled");
      const current = this.ctx.get("connection") as HostConnectionHandle | undefined;
      if (current === undefined || original(current) !== connectionOwner || current.browserPeer !== invocation.peer) throw new ControlRefusal("not-owned");
      const bound = this.ctx.get("subagents");
      if (bound === undefined || original(bound) !== original(runtime)) throw new ControlRefusal("unavailable", undefined, "delivery-fence-unavailable");
    };
    checkConnection();
    const agents = this.ctx.get("agents");
    if (agents === undefined) throw new ControlRefusal("unavailable");
    let parent = agents.get(SessionId(sessionId));
    if (parent === undefined) {
      // Actions never wake an ordinary parent. Only an authenticated, decoded
      // read may use the public controller; Gateway parameter lookup cannot.
      if (!readOnly) throw new ControlRefusal("unavailable", "sessionId");
      const controller = this.ctx.get("sessionController") as Pick<SessionController, "resolveAgent"> | undefined;
      if (controller === undefined) throw new ControlRefusal("unavailable", "sessionId");
      const found = await controller.resolveAgent(SessionId(sessionId));
      checkConnection();
      if ("error" in found) throw new ControlRefusal("unavailable", "sessionId");
      parent = found.agent;
    }
    const exactParent = parent;
    const checkRoot = (): void => {
      checkConnection();
      const current = this.ctx.get("agents");
      if (current === undefined || current.get(SessionId(sessionId)) !== exactParent || exactParent.id !== sessionId || exactParent.session.id !== sessionId
        || exactParent.session.header.origin === "subagent" || !current.roots().includes(exactParent)
        || current.list().some(owner => owner !== exactParent && current.isOwnedBy(SessionId(sessionId), owner))) throw new ControlRefusal("not-owned", "sessionId");
    };
    checkRoot();
    const ticket = runtime.authority.acquireParentTicket(exactParent);
    const signal = AbortSignal.any([initialSignal, ticket.signal]);
    const scope: ControlScope<A> = { parent: exactParent, ticket, signal, check() {
      if (signal.aborted) throw new ControlRefusal("cancelled");
      checkRoot();
      runtime.authority.assertTicket(ticket);
    } };
    scope.check();
    let result: T;
    try { result = await operation(scope); }
    catch (error) { if (signal.aborted) throw new ControlRefusal("cancelled"); throw error; }
    // Native acceptance/handoff owns the write cutoff. Never turn a committed
    // receipt into a failure, rollback accepted work or automatically retry.
    if (readOnly) scope.check();
    return result;
  }

  private capabilities(scope: ControlScope<A>): RoleControlCapabilities {
    scope.check();
    const view = parseRoleControlCapabilities(this.collaborators.capabilities(scope.ticket));
    const runtime = this.collaborators.runtime.authority.view();
    scope.check();
    return { ...view, runtime };
  }

  private async childView(scope: ControlScope<A>, entry: SubagentCatalogEntry, parentSessionId = scope.parent.id): Promise<RoleControlChildView> {
    scope.check();
    const direct = parentSessionId === scope.parent.id;
    const inactive = this.ctx.get("agents")?.get(entry.id)?.status !== "running";
    const observation = direct ? await this.collaborators.observeChild(scope.ticket, entry, scope.signal) : undefined;
    scope.check();
    const projected = observation?.invocation === undefined ? undefined : parseDsmmInvocationView(observation.invocation);
    const mode = entry.mode === "external" ? "unknown" : entry.mode === "continuable" && projected?.mode === "one-shot" ? "one-shot" : entry.mode;
    const reason = !direct ? "not-direct-child" : mode === "one-shot" ? "one-shot" : "unknown-mode";
    const global = this.capabilities(scope);
    const controls = mode === "continuable" && entry.mode === "continuable" && observation !== undefined
      ? { prompt: global.prompt.enabled ? observation.prompt : global.prompt, interrupt: global.interrupt.enabled ? observation.interrupt : global.interrupt }
      : { prompt: disabled(reason), interrupt: disabled(reason) };
    const routeComparison = observation?.routeComparison === undefined ? undefined : parseDsmmRoleRouteComparison(observation.routeComparison);
    if (projected?.childId !== undefined && projected.childId !== entry.id) throw new ControlRefusal("unavailable", "childSessionId");
    if (routeComparison !== undefined && routeComparison.childId !== entry.id) throw new ControlRefusal("unavailable", "childSessionId");
    return { id: entry.id, parentSessionId, mode, activity: inactive ? "inactive" : "running", readonly: !controls.prompt.enabled && !controls.interrupt.enabled,
      ...(entry.label === undefined ? {} : { label: boundedChildLabel(entry.label) }), controls,
      ...(projected === undefined ? {} : { invocation: { ...projected, childId: entry.id } }),
      ...(routeComparison === undefined ? {} : { routeComparison }),
      ...(observation?.evidence === undefined ? {} : { evidence: observation.evidence }) };
  }

  private async runView(scope: ControlScope<A>, holder: RoleRunHolder<C, P>): Promise<RoleControlRunView> {
    scope.check();
    const identity = holder.invocation;
    const background = identity === undefined ? disabled(holder.state === "cancelled" ? "cancelled" : "starting")
      : await this.collaborators.backgroundAvailability(scope.ticket, identity, scope.signal);
    scope.check();
    const current = holder.invocation;
    let invocation: DsmmInvocationView | undefined;
    if (current !== undefined) {
      const { runId: _run, childId: _child, jobId: _job, ...projected } = parseDsmmInvocationView(this.collaborators.projectRun(current));
      const jobId = this.backgroundJobs.get(holder);
      invocation = parseDsmmInvocationView({ ...projected, mode: "one-shot", runId: current.runId,
        ...(current.childId === undefined ? {} : { childId: current.childId }), ...(jobId === undefined ? {} : { jobId }) });
    }
    const globalBackground = this.capabilities(scope).background;
    return { sessionId: holder.sessionId, toolCallId: holder.toolCallId, state: holder.state, ...(invocation === undefined ? {} : { invocation }),
      background: holder.state === "starting" ? disabled("starting") : holder.state === "settled" ? disabled("already-settled") : holder.state === "cancelled" ? disabled("cancelled")
        : holder.state === "background" ? disabled("already-background") : globalBackground.enabled ? background : globalBackground };
  }

  @Remote
  describe(sessionId: string): Promise<ChildSessionSnapshot> {
    return this.invoke(() => this.scoped(this.decode(parseRoleControlSessionId, sessionId), true, async scope => {
      const catalog = await this.collaborators.runtime.listChildren(scope.parent.id, scope.signal);
      scope.check();
      const children: RoleControlChildView[] = [], runs: RoleControlRunView[] = [];
      for (const child of catalog) children.push(await this.childView(scope, child));
      scope.check();
      for (const holder of this.collaborators.runs.list(scope.parent, scope.ticket.owner)) runs.push(await this.runView(scope, holder));
      scope.check();
      return parseChildSessionSnapshot({ sessionId: scope.parent.id, admissionEpoch: scope.ticket.parentEpoch, children, runs, capabilities: this.capabilities(scope) });
    }));
  }

  @Remote
  descendants(sessionId: string): Promise<RoleControlDescendantsSnapshot> {
    return this.invoke(() => this.scoped(this.decode(parseRoleControlSessionId, sessionId), true, async scope => {
      const catalog = await this.collaborators.runtime.listDescendants(scope.parent.id, scope.signal);
      scope.check();
      const descendants: RoleControlDescendantsSnapshot["descendants"] = [];
      for (const entry of catalog) {
        scope.check();
        if (entry.kind === "diagnostic") descendants.push({ kind: "diagnostic", id: entry.id, parentSessionId: entry.parentId, depth: entry.depth, reason: entry.reason });
        else {
          const child = await this.childView(scope, { id: entry.id, mode: entry.mode, createdAt: 0, ...("label" in entry ? { label: entry.label } : {}) } as SubagentCatalogEntry, entry.parentId);
          descendants.push({ kind: "child", depth: entry.depth, hasChildren: entry.hasChildren, child: { ...child, activity: entry.activity } });
        }
      }
      return parseRoleControlDescendants({ sessionId: scope.parent.id, admissionEpoch: scope.ticket.parentEpoch, descendants });
    }));
  }

  @Remote
  background(sessionId: string, input: RoleControlBackgroundRequest): Promise<BackgroundTransitionResult> {
    return this.invoke(async () => {
      const request = this.decode(parseRoleControlBackgroundRequest, input);
      if (request.sessionId !== this.decode(parseRoleControlSessionId, sessionId)) throw new ControlRefusal("validation", "sessionId");
      return this.scoped(sessionId, false, async scope => {
        if (request.expectedAdmissionEpoch !== scope.ticket.parentEpoch) throw new ControlRefusal("conflict", "expectedAdmissionEpoch");
        const holder = this.collaborators.runs.get(scope.parent, scope.ticket.owner, { sessionId: scope.parent.id,
          toolCallId: request.toolCallId as RoleRunInvocation<C, P>["toolCallId"], runId: request.runId as RoleRunInvocation<C, P>["runId"] });
        if (holder?.invocation === undefined) throw new ControlRefusal("not-found", "runId");
        const terminal = terminalTransition(holder.state, holder.invocation.runId);
        if (terminal !== undefined) {
          scope.check();
          return terminal;
        }
        requireEnabled(this.capabilities(scope).background);
        const permitted = await this.collaborators.backgroundAvailability(scope.ticket, holder.invocation, scope.signal);
        scope.check();
        // Result/cancellation may win while asynchronous capability preparation
        // is pending. Observing that terminal state never creates a new job.
        const observed = terminalTransition(holder.state, holder.invocation.runId);
        if (observed !== undefined) return observed;
        requireEnabled(permitted);
        // All async preparation is fenced before the holder's native synchronous
        // jobs.start critical section, which rechecks its own exact authority.
        const result = holder.background({ parent: scope.parent, owner: scope.ticket.owner, sessionId: scope.parent.id,
          toolCallId: holder.toolCallId, runId: holder.invocation.runId, expectedAdmissionEpoch: request.expectedAdmissionEpoch });
        if ("receipt" in result) {
          this.backgroundJobs.set(holder, result.receipt.jobId);
          return { status: result.status, runId: result.receipt.invocation.runId, jobId: result.receipt.jobId };
        }
        if (result.status === "starting") throw new ControlRefusal("disabled", undefined, "starting");
        return { status: result.status, runId: request.runId };
      });
    });
  }

  private async directChild(scope: ControlScope<A>, childId: string): Promise<RoleControlChildView> {
    scope.check();
    const catalog = await this.collaborators.runtime.listChildren(scope.parent.id, scope.signal);
    scope.check();
    const child = catalog.find(child => child.id === childId);
    if (child === undefined) throw new ControlRefusal("not-owned", "childSessionId");
    if (child.mode !== "continuable") throw new ControlRefusal("not-resumable", "childSessionId");
    const view = await this.childView(scope, child);
    if (view.mode !== "continuable") throw new ControlRefusal("not-resumable", "childSessionId");
    return view;
  }

  @Remote
  prompt(sessionId: string, input: SubagentPromptRequest): Promise<SubagentPromptReceipt> {
    return this.invoke(async () => {
      const request = this.decode(parseRoleControlPromptRequest, input);
      if (request.parentSessionId !== this.decode(parseRoleControlSessionId, sessionId)) throw new ControlRefusal("validation", "parentSessionId");
      return this.scoped(sessionId, false, async scope => {
        requireEnabled(this.capabilities(scope).prompt);
        const child = await this.directChild(scope, request.childSessionId);
        scope.check();
        requireEnabled(child.controls.prompt);
        if (request.content.some(part => part.type === "image")) requireEnabled(this.capabilities(scope).images);
        scope.check();
        // Original browser request identity, content, images, zone and delivery
        // enter the unique C1 public override, then native pre-inbox cutoff.
        return this.ctx.subagents.prompt(request, scope.signal);
      });
    });
  }

  @Remote
  interrupt(sessionId: string, input: RoleControlInterruptRequest): Promise<SubagentInterruptReceipt> {
    return this.invoke(async () => {
      const request = this.decode(parseRoleControlInterruptRequest, input);
      if (request.parentSessionId !== this.decode(parseRoleControlSessionId, sessionId)) throw new ControlRefusal("validation", "parentSessionId");
      return this.scoped(sessionId, false, async scope => {
        requireEnabled(this.capabilities(scope).interrupt);
        const child = await this.directChild(scope, request.childSessionId);
        scope.check();
        requireEnabled(child.controls.interrupt);
        scope.check();
        return this.ctx.subagents.interruptByParent(SessionId(request.childSessionId), scope.parent.id, "continuable");
      });
    });
  }
}

declare module "@deepseek-ai/cordis" { interface Context { dsmmChildren: DsmmChildrenHost<DeliveryAdmission, unknown, unknown, unknown> } }

/** Caller supplies an owned Host injection fiber; no replacement or auto-mount. */
export function registerRoleControlRpc<A extends DeliveryAdmission, E, C, P>(ctx: Context, collaborators: RoleControlCollaborators<A, E, C, P>): DsmmChildrenHost<A, E, C, P> {
  const host = new DsmmChildrenHost(ctx, collaborators);
  ctx.typert.register(ROLE_CONTROL_HOST);
  return host;
}
