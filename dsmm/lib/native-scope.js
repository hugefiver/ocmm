import { Context } from "@deepseek-ai/cordis";
import { createRequire } from "node:module";
// Resolve through the declared SDK peer, not a developer/global installation.
const require = createRequire(import.meta.url);
const sdk = createRequire(require.resolve("@deepseek-ai/dsh-agent-preset-registry"));
const scope = sdk("@deepseek-ai/dsh-scope");
export const { scopeOf, scopeParentOf } = scope;
export function nativeAgentContext(agent) {
    if (!(agent.ctx instanceof Context) || scopeOf(agent.ctx) !== agent) {
        throw new Error("dsmm skills require the exact native Agent scope, never a shared preset/global scope");
    }
    return agent.ctx;
}
/** A scope key is opaque; resolve identity against live Agents, not its fields. */
export function agentForScope(ctx, key) {
    if (key === undefined)
        return undefined;
    return ctx.get?.("agents")?.list().find((agent) => agent === key);
}
//# sourceMappingURL=native-scope.js.map