import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { deploymentWorkspace } from "./deployment-workspace.js";
import { CONFIG_MODULES, moduleFields, moduleFor, moduleTitle } from "./deployment-modules.js";
import { at, inspectorPaths, scopeSchema, visibleDeploymentPath } from "./deployment-data.js";
import { Field, displayValue, permissionText } from "./DeploymentFields.js";
import { configurationVersionState } from "./configuration-display.js";
import { PermissionsPanel } from "./PermissionsPanel.js";
import { permissionEn } from "./permission-locales.js";
export function ScopeSave({ controller, workspace, refreshOnly = false, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const pending = [...new Set(controller.pendingPaths().map(moduleFor))];
    return _jsxs("section", { className: "dsmm-scope-save", "aria-label": t(refreshOnly ? "refresh" : "saveScope"), children: [_jsx("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: refreshOnly ? state.busy ? t("loading") : "" : state.busy ? t("saving") : state.refreshRequired ? t("savedRefreshRequired") : state.saved ? t("saved") : state.dirty ? t("dirty") : "" }), !refreshOnly && pending.length > 0 && _jsxs("p", { children: [t("pendingModules"), ": ", pending.map(module => t(moduleTitle(module))).join(" · ")] }), state.issue !== null && _jsx("p", { className: "dsmm-issue", role: "alert", children: t(state.issue) }), !refreshOnly && state.invalidFields.length > 0 && _jsx("p", { className: "dsmm-issue", role: "alert", children: t("invalid") }), controller.layer === "profile" && !controller.canWriteProfile() && _jsx("p", { className: "dsmm-hint", children: t("unavailableForm") }), _jsxs("div", { className: "dsmm-actions", children: [!refreshOnly && _jsx(Button, { type: "button", variant: "primary", disabled: !controller.canSave(), onClick: () => void (workspace?.save() ?? controller.save()), children: t(controller.layer === "global" ? "saveGlobal" : "saveProfile") }), _jsx(Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => void controller.refresh(), children: t("refresh") }), !refreshOnly && _jsx(Button, { type: "button", variant: "outline", disabled: state.busy || !state.dirty && state.issue === null && !state.refreshRequired, onClick: () => void controller.refresh(true), children: t("discard") })] })] });
}
export function NativeRuntimeState({ value, t }) {
    return _jsxs("section", { className: "dsmm-availability", "aria-label": t("nativeRuntimeState"), children: [_jsx("h3", { children: t("nativeRuntimeState") }), _jsxs("p", { children: [t("nativeRuntimeBinding"), ": ", t(value?.binding === "stock" ? "nativeRuntimeStock" : value?.binding === "unavailable" ? "nativeRuntimeUnavailable" : "unknown")] }), _jsxs("p", { children: [t("nativeRuntimeFence"), ": ", value === undefined ? t("unknown") : t(value.deliveryFenceReady ? "on" : "off"), " \u00B7 ", t("nativeRuntimeRestart"), ": ", value === undefined ? t("unknown") : t(value.restartRequired ? "on" : "off")] }), value?.reason !== undefined && _jsx("p", { children: t(`nativeRuntimeReason-${value.reason}`) }), _jsx("p", { className: "dsmm-hint", children: t("nativeRuntimeReadinessHint") })] });
}
export function StateInspector({ controller, t }) {
    const { snapshot, session, dirty, issue } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    if (snapshot === null)
        return _jsx("p", { children: t("unavailable") });
    const admitted = session?.configuration ?? null;
    const source = (value) => t(value === "profile" ? "profileSource" : value === "global" ? "globalSource" : value === "defaults" ? "defaultsSource" : value === "named-session" ? "namedSource" : value === "startup" ? "startupSource" : value === "deployment" ? "deploymentCapture" : value === "mixed" ? "mixedSource" : "unknown");
    const value = (layer, path) => layer === undefined ? t("unknown") : at(layer, path.split(".")) === undefined ? t("absent") : displayValue(at(layer, path.split(".")), t);
    const restart = (snapshot.nextRoot?.restartRequired ?? []).filter(path => visibleDeploymentPath(path.split(".")));
    return _jsxs("div", { className: "dsmm-structured", children: [_jsx("p", { role: "status", children: session === null ? t("noSession") : admitted === null ? t("sessionUnavailable") : t("sessionObserved") }), (dirty || issue !== null) && _jsx("p", { className: "dsmm-hint", children: t("inspectorStale") }), _jsxs("p", { children: [t("globalSource"), ": ", t(configurationVersionState(snapshot.globalRevision)), " \u00B7 ", t("profileSource"), ": ", t(configurationVersionState(snapshot.nativeRevision))] }), snapshot.subagentRuntime !== undefined && _jsx(NativeRuntimeState, { value: snapshot.subagentRuntime, t: t }), snapshot.modules.map(module => _jsxs("section", { className: "dsmm-zone", children: [_jsx("h3", { children: module.descriptor.label }), _jsxs("p", { children: [t("desired"), ": ", t(module.desired.enabled ? "on" : "off"), " \u00B7 ", source(module.desired.source)] }), _jsxs("p", { children: [t("startup"), ": ", module.startupMounted == null ? t("unknown") : t(module.startupMounted ? "on" : "off")] }), _jsxs("p", { children: [t("next"), ": ", module.nextRoot.admitted == null ? t("unknown") : t(module.nextRoot.admitted ? "on" : "off")] }), module.pending && _jsx("p", { children: t("pending") })] }, module.descriptor.id)), inspectorPaths(snapshot, admitted).map(path => _jsxs("dl", { className: "dsmm-deployment-state", children: [_jsx("dt", { children: path }), _jsxs("dd", { children: [t("desired"), ": ", value(snapshot.desired, path), " \u00B7 ", source(snapshot.sources[path])] }), _jsxs("dd", { children: [t("startup"), ": ", value(snapshot.startup, path), " \u00B7 ", source(snapshot.startupSources?.[path])] }), _jsxs("dd", { children: [t("next"), ": ", value(snapshot.nextRoot?.settings, path), " \u00B7 ", source(snapshot.nextRoot?.sources[path])] }), _jsxs("dd", { children: [t("session"), ": ", value(admitted?.settings, path), " \u00B7 ", source(admitted?.sources[path])] })] }, path)), restart.length > 0 && _jsxs("p", { children: [t("pending"), ": ", restart.join(", ")] })] });
}
export function DeploymentPage(props) {
    const workspace = props.workspace ?? deploymentWorkspace(props.core, props.permissions);
    const navigation = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
    const core = useSyncExternalStore(props.core.subscribe, props.core.getSnapshot);
    const controller = workspace.controller() ?? props.core;
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const id = useId(), heading = useRef(null), triggers = useRef(new Map()), previous = useRef(null);
    const scopeControl = useRef(null), confirmation = useRef(null);
    const resume = useRef(null);
    const { t } = props, snapshot = state.snapshot ?? core.snapshot, active = navigation.module;
    useEffect(() => { if (props.view === "page")
        void props.core.refresh(); }, [props.core, props.view]);
    useEffect(() => { if (props.forms !== undefined)
        workspace.bindForms(props.forms); }, [workspace, props.forms]);
    useEffect(() => {
        if (active !== null)
            heading.current?.focus();
        else if (previous.current !== null)
            triggers.current.get(previous.current)?.focus();
        previous.current = active;
    }, [active]);
    useEffect(() => {
        if (navigation.pending !== null) {
            resume.current = { element: document.activeElement, scope: navigation.scope, module: active };
            confirmation.current?.focus();
        }
        else if (resume.current !== null) {
            const from = resume.current;
            resume.current = null;
            if (from.scope === navigation.scope && from.module === active) {
                if (from.element.isConnected)
                    from.element.focus();
            }
            else if (active !== null)
                heading.current?.focus();
            else if (from.scope !== navigation.scope)
                scopeControl.current?.focus();
        }
    }, [navigation.pending, navigation.scope, active]);
    if (props.view === "summary")
        return _jsx("span", { children: t("summary") });
    const fields = snapshot === null || active === null ? [] : moduleFields(scopeSchema(snapshot, controller.layer), active, controller.layer);
    const modules = CONFIG_MODULES.filter(module => module === "state" || module === "permissions" || snapshot === null || moduleFields(snapshot.schema, module, "global").length + moduleFields(scopeSchema(snapshot, "profile"), module, "profile").length > 0);
    const scopeActions = _jsx(ScopeSave, { controller: active === "state" ? props.core : controller, workspace: workspace, refreshOnly: active === "state" || workspace.controller() === null, t: t });
    return _jsxs("section", { className: "dsmm-profiles dsmm-deployment", "data-dsmm-page": true, "aria-label": t("title"), children: [_jsx("p", { children: t("description") }), _jsx("p", { className: "dsmm-hint", children: t("boundaries") }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${id}-scope`, children: t("scope") }), _jsxs("select", { ref: scopeControl, id: `${id}-scope`, value: navigation.scope, disabled: state.busy || navigation.pending !== null, onChange: event => {
                            const scope = event.currentTarget.value;
                            if (scope === "global" || scope === "profile")
                                workspace.request({ scope, module: active });
                        }, children: [_jsx("option", { value: "global", children: t("global") }), _jsx("option", { value: "profile", children: t("profile") })] })] }), _jsx("p", { className: "dsmm-hint", children: t(navigation.scope === "global" ? "globalHint" : "profileHint") }), navigation.scope === "profile" && (navigation.native === null || !navigation.native.canWriteProfile()) && _jsx("p", { className: "dsmm-hint", children: t("unavailableForm") }), _jsxs("div", { className: "dsmm-deployment-frame", "data-drawer-open": active !== null, children: [_jsx("nav", { className: "dsmm-module-list", "aria-label": t("modules"), children: modules.map(module => _jsx(Button, { ref: element => { if (element !== null)
                                triggers.current.set(module, element); }, type: "button", variant: "outline", disabled: navigation.pending !== null, "aria-expanded": active === module, "aria-controls": `${id}-drawer`, onClick: () => workspace.request({ scope: navigation.scope, module }), children: t(moduleTitle(module)) }, module)) }), active !== null && _jsxs("aside", { id: `${id}-drawer`, className: "dsmm-module-drawer", "aria-labelledby": `${id}-heading`, "data-dsmm-module": active, onKeyDown: event => {
                            if (event.key !== "Escape" || event.defaultPrevented)
                                return;
                            const target = event.target;
                            if (target.tagName === "SELECT" && (!globalThis.CSS?.supports("selector(select:open)") || target.matches("select:open")))
                                return;
                            event.preventDefault();
                            if (navigation.pending !== null)
                                workspace.continueEditing();
                            else
                                workspace.request({ scope: navigation.scope, module: null });
                        }, children: [_jsxs("div", { className: "dsmm-drawer-heading", children: [_jsx("h2", { id: `${id}-heading`, ref: heading, tabIndex: -1, children: t(moduleTitle(active)) }), _jsx(Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => workspace.request({ scope: navigation.scope, module: null }), children: t("close") })] }), active === "state" ? _jsxs(_Fragment, { children: [_jsx(StateInspector, { controller: props.core, t: t }), scopeActions] }) : _jsxs(_Fragment, { children: [navigation.scope === "profile" && navigation.native === null ? _jsx("p", { children: t("unavailableForm") }) : state.snapshot === null ? _jsx("p", { children: t(state.busy ? "loading" : "unavailable") }) : _jsxs("div", { "data-dsmm-layer": controller.layer, "aria-busy": state.busy, className: "dsmm-structured", children: [fields.length === 0 && _jsx("p", { className: "dsmm-hint", children: t("noModuleFields") }), fields.map(([key, schema]) => _jsx(Field, { schema: schema, path: [key], controller: controller, t: t }, key)), active === "run" && controller.layer === "profile" && _jsx(NativeRuntimeState, { value: state.snapshot.subagentRuntime, t: t })] }), scopeActions, active === "permissions" && _jsxs("section", { className: "dsmm-zone", children: [_jsx("h3", { children: t("rootRules") }), _jsx("p", { className: "dsmm-hint", children: t("rootRulesHint") }), workspace.permissions === undefined ? _jsx("p", { children: t("rootRulesUnavailable") }) : _jsx(PermissionsPanel, { controller: workspace.permissions, t: key => Object.hasOwn(permissionEn, key) ? permissionText(t)(key) : key })] })] })] })] }), navigation.pending !== null && _jsxs("section", { className: "dsmm-confirm", role: "group", "aria-label": t("leaveDraft"), onKeyDown: event => { if (event.key === "Escape" && !event.defaultPrevented) {
                    event.preventDefault();
                    workspace.continueEditing();
                } }, children: [_jsx("p", { children: t("leaveDraft") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { ref: confirmation, type: "button", variant: "primary", onClick: () => workspace.continueEditing(), children: t("continueEditing") }), _jsx(Button, { type: "button", variant: "outline", onClick: () => workspace.keepAndNavigate(), children: t("keepDraft") }), _jsx(Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => void workspace.discardAndNavigate(), children: t("discardDraft") })] })] })] });
}
//# sourceMappingURL=DeploymentPage.js.map