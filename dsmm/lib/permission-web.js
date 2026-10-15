import * as Native from "@deepseek-ai/dsh-tool-web";
import { DsmmPermissionController } from "./permission-controller.js";
export { Config, inject, name } from "@deepseek-ai/dsh-tool-web";
export function apply(ctx, config) {
    return Native.apply(DsmmPermissionController.toolScope(ctx, "web"), config);
}
//# sourceMappingURL=permission-web.js.map