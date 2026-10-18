import * as Native from "@deepseek-ai/dsh-tool-web";
import { DsmmPermissionController } from "./permission-controller.js";
import { temporaryWebToolScope } from "./permission-temporary-web.js";
export { Config, inject, name } from "@deepseek-ai/dsh-tool-web";
export function apply(ctx, config) {
    return Native.apply(temporaryWebToolScope(DsmmPermissionController.toolScope(ctx, "web")), config);
}
//# sourceMappingURL=permission-web.js.map