import { TYPERT_REMOTE } from "../profile-remote.js";
import { ProfilesController } from "./controller.js";
import { NS, en, zh } from "./locales.js";
import { ProfilesSection } from "./ProfilesSection.js";
import { PROFILE_STYLES } from "./styles.js";
import { SessionProfiles } from "./SessionProfiles.js";
import { DeploymentController } from "./deployment-controller.js";
import { DeploymentPage } from "./DeploymentPage.js";
import { DEPLOYMENT_NS, deploymentEn, deploymentZh } from "./deployment-locales.js";
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
    let deployment = null;
    let profiles = null;
    // This core-owned graph must not depend on DW, named profiles or a session.
    await ctx.inject(["remote.dsmmConfig"], (coreCtx) => {
        const core = new DeploymentController(coreCtx.remote.dsmmConfig, "global");
        void coreCtx.inject(["connection"], connectionCtx => {
            core.bindConnection(connectionCtx.connection.generation);
            void core.refresh();
        });
        deployment = core;
        if (profiles !== null)
            core.setSession(profiles.store.getSnapshot().session);
        coreCtx.effect(() => () => { deployment = null; core.dispose(); }, "dsmm: core settings editor");
        coreCtx.effect(() => coreCtx.locale.register(DEPLOYMENT_NS, { en: deploymentEn, zh: deploymentZh }), "dsmm: core locale");
        coreCtx.effect(() => {
            const style = document.createElement("style");
            style.dataset.dsmmSettings = "";
            style.textContent = PROFILE_STYLES;
            document.head.append(style);
            return () => style.remove();
        }, "dsmm: core styles");
        const t = coreCtx.locale.bind(DEPLOYMENT_NS);
        const inject = () => ({ core, remote: coreCtx.remote.dsmmConfig });
        coreCtx.slots.inject("plugins.item", () => coreCtx.slots.register({ name: "plugins.item", id: "dsmm", label: () => t("title"), order: 30, locale: DEPLOYMENT_NS, inject }, DeploymentPage));
        // Native ConfigForms owns its transport/authority; absent service leaves only core controls.
        void coreCtx.inject(["configForms"], formCtx => {
            const injectProfile = () => ({ ...inject(), forms: formCtx.configForms, profilePage: true });
            formCtx.slots.inject("plugins.bundle.config", () => formCtx.slots.register({ name: "plugins.bundle.config", key: "@dsmm/dsmm", locale: DEPLOYMENT_NS, inject: injectProfile }, DeploymentPage));
            let namespace = null, disposeRow;
            const registerRow = () => {
                const next = core.getSnapshot().snapshot?.namespace ?? null;
                if (next === namespace)
                    return;
                disposeRow?.();
                namespace = next;
                if (next !== null)
                    disposeRow = formCtx.slots.inject("plugins.row.config", () => formCtx.slots.register({ name: "plugins.row.config", key: `@dsmm/dsmm#${next}`, locale: DEPLOYMENT_NS, inject: () => ({ ...injectProfile(), rowNamespace: next }) }, DeploymentPage));
            };
            registerRow();
            formCtx.effect(() => core.subscribe(registerRow));
            formCtx.effect(() => () => disposeRow?.());
        });
        void core.refresh();
    });
    await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {
        const controller = new ProfilesController(profileCtx.remote.dsmmProfiles);
        profiles = controller;
        profileCtx.effect(() => controller.store.subscribe(() => deployment?.setSession(controller.store.getSnapshot().session)));
        profileCtx.effect(() => () => { profiles = null; deployment?.setSession(null); });
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
        // Lowest numeric priority wins in native SlotCore. This root-scoped
        // fallback never replaces ordinary native/plugin leading navigation.
        profileCtx.slots.inject("conversation.header.leading", () => profileCtx.slots.register({
            name: "conversation.header.leading", priority: Number.MAX_SAFE_INTEGER, locale: NS,
            inject: () => ({ hooks: { profiles: controller.store }, readProfileView: controller.store.getSnapshot, ...controller.actions }),
        }, SessionProfiles));
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
        });
        void controller.refresh();
    });
}
//# sourceMappingURL=index.js.map