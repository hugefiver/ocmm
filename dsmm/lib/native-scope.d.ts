import { Context } from "@deepseek-ai/cordis";
import type { DshAgent, DshContext, DshSystemPromptContext } from "./dsh-types.js";
type NativeScopeKey = NonNullable<DshSystemPromptContext["scope"]>;
export declare const scopeOf: (ctx: Context) => NativeScopeKey | undefined, scopeParentOf: (key: NativeScopeKey) => NativeScopeKey | undefined;
export declare function nativeAgentContext(agent: DshAgent): Context;
/** A scope key is opaque; resolve identity against live Agents, not its fields. */
export declare function agentForScope(ctx: DshContext, key: object | undefined): DshAgent | undefined;
export {};
//# sourceMappingURL=native-scope.d.ts.map