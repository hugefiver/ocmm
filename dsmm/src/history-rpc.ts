import { getTraceable, symbols } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
import { RemoteAccessService } from "@deepseek-ai/dsh-api-remote-access";
import { SessionId } from "@deepseek-ai/dsh-session";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@deepseek-ai/dsh-typert-registry";
import { assertLocalSettingsOperator } from "./profile-rpc.js";
import { scopeLifetime } from "./lifetime.js";
import { HistoryContinuations, HistoryRefusal, historyFailure } from "./history-controller.js";
import { HISTORY_HOST } from "./history-remote.js";
import { historySessionId, parseHistoryConfirmRequest, parseHistoryFailure, parseHistoryPreviewRequest } from "./history-codec.js";
import type { HistoryCandidates, HistoryNativeAdmission, HistoryOperator } from "./history-contract.js";
import type { HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";

/** Native authenticated local-operator RPC; browser payloads carry no admission authority. */
export class DsmmHistoryHost extends TypertRemoteService {
  private readonly lifetime = new AbortController();
  constructor(ctx: Context, private readonly history: HistoryContinuations) {
    super(ctx, "dsmmHistory");
    scopeLifetime(ctx, "dsmm: close history RPC", () => this.lifetime.abort());
  }
  private operator(): HistoryOperator {
    try { assertLocalSettingsOperator(this.ctx); } catch { throw new HistoryRefusal("not-owned"); }
    const ctx = this.ctx, invocation = ctx.invocation!;
    const connection = ctx.get("connection") as HostConnectionHandle;
    const owner: object = Reflect.get(connection, symbols.original) ?? connection;
    const peer = invocation.peer;
    const signal = AbortSignal.any([invocation.signal, peer.signal, this.lifetime.signal]);
    const assertOwner = () => {
      this.lifetime.signal.throwIfAborted(); peer.signal.throwIfAborted();
      const current = ctx.get("connection") as HostConnectionHandle | undefined;
      if (!current || (Reflect.get(current, symbols.original) ?? current) !== owner || current.browserPeer !== peer
        || ctx.get("webServer")?.host !== "127.0.0.1" || ctx.get("settings")?.writable !== true) throw new HistoryRefusal("not-owned");
    };
    return { peer, connection: owner, peerSignal: peer.signal, signal, assertOwner,
      assertCurrent: () => { signal.throwIfAborted(); assertOwner(); },
      assertVisible: id => {
        assertOwner();
        const access: unknown = ctx.get("remoteAccess");
        if (!(access instanceof RemoteAccessService) || !access.allows({ kind: "session", id: SessionId(id) })) throw new HistoryRefusal("not-owned");
      } };
  }
  private async invoke<T>(operation: (history: HistoryContinuations, operator: HistoryOperator) => Promise<T>): Promise<T> {
    try { return await operation(getTraceable(this.ctx, this.history), this.operator()); }
    catch (error) { throw new RemoteError("dsmm-history/refused", "The Host refused history continuation.", parseHistoryFailure(historyFailure(error))); }
  }
  @Remote
  describe(sessionId: string): Promise<HistoryStatus> { return this.invoke((history, operator) => history.describe(historySessionId(sessionId), operator)); }
  @Remote
  choices(): Promise<HistoryChoices> { return this.invoke((history, operator) => history.choices(operator)); }
  @Remote
  preview(sessionId: string, input: HistoryPreviewRequest): Promise<HistoryPreview> {
    return this.invoke((history, operator) => {
      const request = parseHistoryPreviewRequest(input);
      if (historySessionId(sessionId) !== request.sessionId) throw new HistoryRefusal("validation");
      return history.preview(request, operator);
    });
  }
  @Remote
  confirm(sessionId: string, input: HistoryConfirmRequest): Promise<HistoryContinuationResult> {
    return this.invoke((history, operator) => {
      const request = parseHistoryConfirmRequest(input);
      if (historySessionId(sessionId) !== request.sessionId) throw new HistoryRefusal("validation");
      return history.confirm(request, operator);
    });
  }
}
declare module "@deepseek-ai/cordis" { interface Context { dsmmHistory: DsmmHistoryHost } }
export function registerHistoryContinuationRpc(ctx: Context, candidates: HistoryCandidates, admission: HistoryNativeAdmission): DsmmHistoryHost {
  const history = new HistoryContinuations(ctx, candidates, admission);
  const host = new DsmmHistoryHost(ctx, history);
  ctx.typert.register(HISTORY_HOST);
  return host;
}
