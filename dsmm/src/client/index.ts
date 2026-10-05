import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-api-session-controller/remote";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { TYPERT_REMOTE } from "../profile-remote.js";
import { ProfilesController } from "./controller.js";
import { NS, en, zh } from "./locales.js";
import { ProfilesSection } from "./ProfilesSection.js";
import { PROFILE_STYLES } from "./styles.js";
import { SessionProfiles } from "./SessionProfiles.js";

export { ProfilesController, NEW_PROFILE_CONTENT } from "./controller.js";
export type { ProfilesActions, ProfilesViewSnapshot, ProfilesIssue } from "./controller.js";
export { ProfilesSection } from "./ProfilesSection.js";
export type { ProfilesSectionProps, ProfilesInjected } from "./ProfilesSection.js";
export { NS, en, zh } from "./locales.js";
export { TYPERT_REMOTE } from "../profile-remote.js";
export { SessionProfiles } from "./SessionProfiles.js";
export { structuredDocument, editStructuredPath, moveFallback } from "./structured.js";

/** No self-dependency on a namespace that this contribution has not mounted. */
export const inject = ["slots", "locale", "remote"] as const;

export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(TYPERT_REMOTE);
  await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {
    const controller = new ProfilesController(profileCtx.remote.dsmmProfiles);
    profileCtx.effect(() => () => controller.dispose(), "dsmm: profile editor");
    profileCtx.effect(() => profileCtx.locale.register(NS, { en, zh }), "dsmm: profile locale");
    profileCtx.effect(() => {
      const style = document.createElement("style");
      style.dataset.dsmmProfiles = "";
      style.textContent = PROFILE_STYLES;
      document.head.append(style);
      return () => style.remove();
    }, "dsmm: profile styles");
    const t = profileCtx.locale.bind(NS);
    profileCtx.slots.inject("settings.section", () => profileCtx.slots.register({
      name: "settings.section", id: "dsmm-profiles", order: 30,
      label: () => t("title"), locale: NS,
      inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions }),
    }, ProfilesSection));
    // Optional native services have their own lifetime. Do not await them or
    // make sessionless Settings depend on a Conversation/session provider.
    void profileCtx.inject(["remote.session"], (catalogCtx) => {
      controller.attachCatalog(catalogCtx.remote.session);
      catalogCtx.effect(() => () => controller.attachCatalog(null), "dsmm: native catalog lifetime");
    });
    void profileCtx.inject(["uiSession"], (sessionCtx) => {
      const source = sessionCtx.uiSession.adapter.current;
      const update = () => controller.setSession(source.getSnapshot().key ?? null);
      update();
      sessionCtx.effect(() => source.subscribe(update), "dsmm: current native session");
      sessionCtx.effect(() => () => controller.setSession(null), "dsmm: native session withdrawal");
      sessionCtx.slots.inject("conversation.session.header.utilities", () => sessionCtx.slots.register({
        name: "conversation.session.header.utilities", id: "dsmm-session-profiles", order: 30, locale: NS,
        inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions }),
      }, SessionProfiles));
    });
    void controller.refresh();
  });
}
