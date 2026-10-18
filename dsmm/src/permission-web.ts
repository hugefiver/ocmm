import type { Context } from "@deepseek-ai/cordis";
import * as Native from "@deepseek-ai/dsh-tool-web";
import { DsmmPermissionController } from "./permission-controller.js";
import { temporaryWebToolScope } from "./permission-temporary-web.js";

export { Config, inject, name } from "@deepseek-ai/dsh-tool-web";
export function apply(ctx: Context, config: Native.Config): ReturnType<typeof Native.apply> {
  return Native.apply(temporaryWebToolScope(DsmmPermissionController.toolScope(ctx, "web")), config);
}
