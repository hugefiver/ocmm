import * as Native from "@deepseek-ai/dsh-tool-bash";
export { Config, name } from "@deepseek-ai/dsh-tool-bash";
export const inject = [...Native.inject, "dsmmPermissionController"];
export function apply(ctx, config) {
    Native.apply(ctx.dsmmPermissionController.shellScope(ctx, "bash"), config);
}
//# sourceMappingURL=permission-bash.js.map