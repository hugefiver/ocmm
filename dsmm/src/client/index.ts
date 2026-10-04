import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import { TYPERT_REMOTE } from "../profile-remote.js";
import { ProfilesController } from "./controller.js";
import { NS, en, zh } from "./locales.js";
import { ProfilesSection } from "./ProfilesSection.js";
import { PROFILE_STYLES } from "./styles.js";

export { ProfilesController, NEW_PROFILE_CONTENT } from "./controller.js";
export type { ProfilesActions, ProfilesViewSnapshot, ProfilesIssue } from "./controller.js";
export { ProfilesSection } from "./ProfilesSection.js";
export type { ProfilesSectionProps, ProfilesInjected } from "./ProfilesSection.js";
export { NS, en, zh } from "./locales.js";
export { TYPERT_REMOTE } from "../profile-remote.js";

/** No self-dependency on a namespace that this contribution has not mounted. */
export const inject = ["slots", "locale", "remote"] as const;

export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(TYPERT_REMOTE);
  const controller = new ProfilesController(ctx.remote.dsmmProfiles);
  ctx.effect(() => () => controller.dispose(), "dsmm: profile editor");
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "dsmm: profile locale");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.dsmmProfiles = "";
    style.textContent = PROFILE_STYLES;
    document.head.append(style);
    return () => style.remove();
  }, "dsmm: profile styles");
  const t = ctx.locale.bind(NS);
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section", id: "dsmm-profiles", order: 30,
    label: () => t("title"), locale: NS,
    inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions }),
  }, ProfilesSection));
  void controller.refresh();
}
