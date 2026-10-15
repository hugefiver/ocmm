import * as Native from "@deepseek-ai/dsh-tool-pwsh";
export { Config, name } from "@deepseek-ai/dsh-tool-pwsh";
export const inject = [...Native.inject, "dsmmPermissionController"];
export function apply(ctx, config) {
    Native.apply(ctx.dsmmPermissionController.shellScope(ctx, "pwsh"), config);
}
//# sourceMappingURL=permission-pwsh.js.map