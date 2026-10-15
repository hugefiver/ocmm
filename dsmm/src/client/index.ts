import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-api-session-controller/remote";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-model-selection/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import { TYPERT_REMOTE } from "../profile-remote.js";
import { ProfilesController } from "./controller.js";
import { NS, en, zh } from "./locales.js";
import { ProfilesSection } from "./ProfilesSection.js";
import { PROFILE_STYLES } from "./styles.js";
import { SessionProfiles } from "./SessionProfiles.js";
import type {} from "./plugins-contract.js";
import { DeploymentController } from "./deployment-controller.js";
import { DeploymentPage } from "./DeploymentPage.js";
import { DEPLOYMENT_NS, deploymentEn, deploymentZh } from "./deployment-locales.js";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import { ROLE_CONTROL_REMOTE } from "../role-control-remote.js";
import { ChildrenController } from "./children-controller.js";
import { ChildrenPanel } from "./ChildrenPanel.js";
import { CHILDREN_NS, childrenLocaleEn, childrenLocaleZh } from "./children-locales.js";
import { PERMISSION_REMOTE } from "../permission-remote.js";
import { permissionClient } from "./permission-client.js";
import { PermissionController } from "./permission-controller.js";
import { PermissionsPanel } from "./PermissionsPanel.js";
import { PERMISSIONS_NS, permissionEn, permissionZh } from "./permission-locales.js";
import type { SessionBinding } from "@deepseek-ai/dsh-api-session-controller/client";

export { ProfilesController, NEW_PROFILE_CONTENT } from "./controller.js";
export type { ProfilesActions, ProfilesViewSnapshot, ProfilesIssue, SessionApplyOptions, ProfileModelSelectorRemote } from "./controller.js";
export { ProfilesSection } from "./ProfilesSection.js";
export type { ProfilesSectionProps, ProfilesInjected } from "./ProfilesSection.js";
export { NS, en, zh } from "./locales.js";
export { TYPERT_REMOTE } from "../profile-remote.js";
export { SessionProfiles } from "./SessionProfiles.js";
export { structuredDocument, editStructuredPath, moveFallback } from "./structured.js";
export { ChildrenController } from "./children-controller.js";
export type { ChildrenActions, ChildrenSnapshot, ChildrenIssue } from "./children-controller.js";
export { ChildrenPanel } from "./ChildrenPanel.js";
export { ROLE_CONTROL_REMOTE } from "../role-control-remote.js";

/** No self-dependency on a namespace that this contribution has not mounted. */
export const inject = ["slots", "locale", "remote"] as const;

export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(TYPERT_REMOTE);
  await ctx.remote.$mount(ROLE_CONTROL_REMOTE);
  await ctx.remote.$mount(PERMISSION_REMOTE);
  const permissions = new PermissionController();
  ctx.effect(() => () => permissions.dispose(), "dsmm: permission controls");
  ctx.effect(() => ctx.locale.register(PERMISSIONS_NS, { en: permissionEn, zh: permissionZh }), "dsmm: permission locale");
  ctx.effect(() => {
    const style = document.createElement("style"); style.dataset.dsmmPermissions = ""; style.textContent = PROFILE_STYLES;
    document.head.append(style); return () => style.remove();
  }, "dsmm: permission styles");
  const permissionInject = () => ({ controller: permissions }), permissionT = ctx.locale.bind(PERMISSIONS_NS);
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "dsmm-permissions", order: 35,
    label: () => permissionT("title"), locale: PERMISSIONS_NS, inject: permissionInject }, PermissionsPanel));
  ctx.slots.inject("conversation.view", () => ctx.slots.register({ name: "conversation.view", id: "dsmm-permissions", order: 35,
    label: () => permissionT("title"), locale: PERMISSIONS_NS, inject: permissionInject }, PermissionsPanel));
  void ctx.inject(["connection"], connectionCtx => {
    const handle = connectionCtx.connection as unknown as ConnectionHandle, invoke = permissionClient(handle);
    const update = () => { const generation = handle.generation.getSnapshot(); permissions.bindConnection(generation === undefined ? null : invoke, generation); };
    update(); connectionCtx.effect(() => handle.generation.subscribe(update));
    connectionCtx.effect(() => () => permissions.bindConnection(null), "dsmm: permission connection withdrawal");
  });
  void ctx.inject(["uiSession", "sessions"], sessionCtx => {
    const source = sessionCtx.uiSession.adapter.current, sessions = sessionCtx.sessions as unknown as ISessions;
    let observed: SessionBinding | undefined, stop: (() => void) | undefined;
    const update = () => {
      const id = source.getSnapshot().key as SessionId | undefined, binding = id === undefined ? undefined : sessions.binding(id);
      if (binding !== observed) { stop?.(); observed = binding; stop = binding?.session.subscribe(update); }
      const snapshot = binding?.session.getSnapshot(), catalog = sessions.list.getSnapshot(), summary = id === undefined ? undefined : catalog.byId[id];
      const child = snapshot?.subagent != null || summary?.origin === "subagent" || summary?.parentId !== undefined;
      const root = id !== undefined && binding?.sessionId === id && snapshot?.sessionId === id && snapshot.openState === "open" && !snapshot.removed
        && catalog.ids.includes(id) && summary !== undefined && !child;
      permissions.bindScope(id ?? null, binding ?? null, child ? "child" : root ? "root" : "unknown");
    };
    update(); sessionCtx.effect(() => source.subscribe(update)); sessionCtx.effect(() => sessions.list.subscribe(update));
    sessionCtx.effect(() => () => { stop?.(); permissions.bindScope(null, null, "unknown"); }, "dsmm: permission native session withdrawal");
  });
  let deployment: DeploymentController | null = null;
  let profiles: ProfilesController | null = null;
  let children: ChildrenController | null = null;
  const observeChildAdmission = () => {
    const session = profiles?.store.getSnapshot().session;
    if (session !== null && session !== undefined) children?.observeAdmission(session.sessionId, session.admissionEpoch);
  };
  await ctx.inject(["remote.dsmmChildren"], childCtx => {
    const controller = new ChildrenController(childCtx.remote.dsmmChildren); children = controller;
    childCtx.effect(() => () => { children = null; controller.dispose(); }, "dsmm: child controls");
    childCtx.effect(() => childCtx.locale.register(CHILDREN_NS, { en: childrenLocaleEn, zh: childrenLocaleZh }), "dsmm: child locale");
    childCtx.effect(() => {
      const style = document.createElement("style"); style.dataset.dsmmChildren = ""; style.textContent = PROFILE_STYLES;
      document.head.append(style); return () => style.remove();
    }, "dsmm: child styles");
    const t = childCtx.locale.bind(CHILDREN_NS);
    childCtx.slots.inject("conversation.view", () => childCtx.slots.register({ name: "conversation.view", id: "dsmm-children", order: 30,
      label: () => t("title"), locale: CHILDREN_NS, inject: () => ({ hooks: { children: controller.store }, ...controller.actions }) }, ChildrenPanel));
    void childCtx.inject(["connection"], connectionCtx => {
      const handle = connectionCtx.connection as unknown as ConnectionHandle;
      const update = () => { const generation = handle.generation.getSnapshot(); controller.bindConnection(generation === undefined ? null : handle, generation); };
      update(); connectionCtx.effect(() => handle.generation.subscribe(update));
      connectionCtx.effect(() => () => controller.bindConnection(null), "dsmm: child connection withdrawal");
    });
    void childCtx.inject(["uiSession", "sessions"], sessionCtx => {
      const source = sessionCtx.uiSession.adapter.current, nativeSessions = sessionCtx.sessions as unknown as ISessions;
      const update = () => { const id = source.getSnapshot().key; controller.bindScope(id ?? null, id === undefined ? null : nativeSessions.binding(id as SessionId) ?? null); observeChildAdmission(); };
      update(); sessionCtx.effect(() => source.subscribe(update));
      sessionCtx.effect(() => () => controller.bindScope(null, null), "dsmm: child session withdrawal");
    });
    observeChildAdmission();
  });
  // This core-owned graph must not depend on DW, named profiles or a session.
  await ctx.inject(["remote.dsmmConfig"], (coreCtx) => {
    const core = new DeploymentController(coreCtx.remote.dsmmConfig, "global");
    void coreCtx.inject(["connection"], connectionCtx => {
      core.bindConnection((connectionCtx.connection as unknown as ConnectionHandle).generation);
      void core.refresh();
    });
    deployment = core;
    if (profiles !== null) core.setSession(profiles.store.getSnapshot().session);
    coreCtx.effect(() => () => { deployment = null; core.dispose(); }, "dsmm: core settings editor");
    coreCtx.effect(() => coreCtx.locale.register(DEPLOYMENT_NS, { en: deploymentEn, zh: deploymentZh }), "dsmm: core locale");
    coreCtx.effect(() => {
      const style = document.createElement("style"); style.dataset.dsmmSettings = ""; style.textContent = PROFILE_STYLES;
      document.head.append(style); return () => style.remove();
    }, "dsmm: core styles");
    const t = coreCtx.locale.bind(DEPLOYMENT_NS);
    const inject = () => ({ core, remote: coreCtx.remote.dsmmConfig });
    coreCtx.slots.inject("plugins.item", () => coreCtx.slots.register({ name: "plugins.item", id: "dsmm", label: () => t("title"), order: 30, locale: DEPLOYMENT_NS, inject }, DeploymentPage));
    // Native ConfigForms owns its transport/authority; absent service leaves only core controls.
    void coreCtx.inject(["configForms"], formCtx => {
      const injectProfile = () => ({ ...inject(), forms: formCtx.configForms, profilePage: true });
      formCtx.slots.inject("plugins.bundle.config", () => formCtx.slots.register({ name: "plugins.bundle.config", key: "@dsmm/dsmm", locale: DEPLOYMENT_NS, inject: injectProfile }, DeploymentPage));
      let namespace: string | null = null, disposeRow: (() => void) | undefined;
      const registerRow = () => {
        const next = core.getSnapshot().snapshot?.namespace ?? null;
        if (next === namespace) return;
        disposeRow?.(); namespace = next;
        if (next !== null) disposeRow = formCtx.slots.inject("plugins.row.config", () => formCtx.slots.register({ name: "plugins.row.config", key: `@dsmm/dsmm#${next}`, locale: DEPLOYMENT_NS, inject: () => ({ ...injectProfile(), rowNamespace: next }) }, DeploymentPage));
      };
      registerRow(); formCtx.effect(() => core.subscribe(registerRow)); formCtx.effect(() => () => disposeRow?.());
    });
    void core.refresh();
  });
  await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {
    const controller = new ProfilesController(profileCtx.remote.dsmmProfiles);
    profiles = controller;
    profileCtx.effect(() => controller.store.subscribe(() => { deployment?.setSession(controller.store.getSnapshot().session); observeChildAdmission(); }));
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
      inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions }),
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
      const nativeSessions = sessionCtx.sessions as unknown as ISessions;
      const update = () => {
        const binding = source.getSnapshot();
        controller.setSession(binding.key ?? null);
        controller.attachModelSelectionSource(binding.key ?? null, binding.key === undefined ? null : binding.keyedHooks.projection?.("modelSelection") ?? null);
        controller.attachModelEventSource(binding.key ?? null, binding.key === undefined ? null : nativeSessions.binding(binding.key as SessionId)?.eventSource ?? null);
      };
      update();
      sessionCtx.effect(() => source.subscribe(update), "dsmm: current native session");
      sessionCtx.effect(() => () => { controller.attachModelSelectionSource(null, null); controller.attachModelEventSource(null, null); controller.attachModelInteractionSource(null, null); controller.setSession(null); }, "dsmm: native session withdrawal");
      void sessionCtx.inject(["modelDirectories", "remote.session"], (modelCtx) => {
        const updateInteraction = () => {
          const id = source.getSnapshot().key;
          if (id === undefined || nativeSessions.binding(id as SessionId) === undefined) { controller.attachModelInteractionSource(null, null); return; }
          try { controller.attachModelInteractionSource(id, modelCtx.modelDirectories.directoryFor(id as SessionId).store); }
          catch { controller.attachModelInteractionSource(null, null); } // An ended native scope fails closed for the optional model stage.
        };
        updateInteraction();
        modelCtx.effect(() => source.subscribe(updateInteraction), "dsmm: native model interaction binding");
        modelCtx.effect(() => () => controller.attachModelInteractionSource(null, null), "dsmm: native model interaction withdrawal");
      });
    });
    void controller.refresh();
  });
}
