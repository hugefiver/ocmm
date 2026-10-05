import { TYPERT_REMOTE } from "../profile-remote.js";
import { ProfilesController } from "./controller.js";
import { NS, en, zh } from "./locales.js";
import { ProfilesSection } from "./ProfilesSection.js";
import { PROFILE_STYLES } from "./styles.js";
import { SessionProfiles } from "./SessionProfiles.js";
export { ProfilesController, NEW_PROFILE_CONTENT } from "./controller.js";
export { ProfilesSection } from "./ProfilesSection.js";
export { NS, en, zh } from "./locales.js";
export { TYPERT_REMOTE } from "../profile-remote.js";
export { SessionProfiles } from "./SessionProfiles.js";
export { structuredDocument, editStructuredPath, moveFallback } from "./structured.js";
/** No self-dependency on a namespace that this contribution has not mounted. */
export const inject = ["slots", "locale", "remote"];
export async function apply(ctx) {
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
            controller.attachModelSelector(catalogCtx.remote.session);
            catalogCtx.effect(() => () => { controller.attachModelSelector(null); controller.attachCatalog(null); }, "dsmm: native catalog/selector lifetime");
        });
        void profileCtx.inject(["uiSession", "sessions"], (sessionCtx) => {
            const source = sessionCtx.uiSession.adapter.current;
            // This adapter compiles with both Host and Client Cordis declarations;
            // the injected browser service has the public Client Sessions face.
            const nativeSessions = sessionCtx.sessions;
            const update = () => {
                const binding = source.getSnapshot();
                controller.setSession(binding.key ?? null);
                controller.attachModelSelectionSource(binding.key ?? null, binding.key === undefined ? null : binding.keyedHooks.projection?.("modelSelection") ?? null);
                controller.attachModelEventSource(binding.key ?? null, binding.key === undefined ? null : nativeSessions.binding(binding.key)?.eventSource ?? null);
            };
            update();
            sessionCtx.effect(() => source.subscribe(update), "dsmm: current native session");
            sessionCtx.effect(() => () => { controller.attachModelSelectionSource(null, null); controller.attachModelEventSource(null, null); controller.attachModelInteractionSource(null, null); controller.setSession(null); }, "dsmm: native session withdrawal");
            void sessionCtx.inject(["modelDirectories", "remote.session"], (modelCtx) => {
                const updateInteraction = () => {
                    const id = source.getSnapshot().key;
                    if (id === undefined || nativeSessions.binding(id) === undefined) {
                        controller.attachModelInteractionSource(null, null);
                        return;
                    }
                    try {
                        controller.attachModelInteractionSource(id, modelCtx.modelDirectories.directoryFor(id).store);
                    }
                    catch {
                        controller.attachModelInteractionSource(null, null);
                    } // An ended native scope fails closed for the optional model stage.
                };
                updateInteraction();
                modelCtx.effect(() => source.subscribe(updateInteraction), "dsmm: native model interaction binding");
                modelCtx.effect(() => () => controller.attachModelInteractionSource(null, null), "dsmm: native model interaction withdrawal");
            });
            sessionCtx.slots.inject("conversation.session.header.utilities", () => sessionCtx.slots.register({
                name: "conversation.session.header.utilities", id: "dsmm-session-profiles", order: 30, locale: NS,
                inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions }),
            }, SessionProfiles));
        });
        void controller.refresh();
    });
}
//# sourceMappingURL=index.js.map