import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { DeploymentController } from "./deployment-controller.js";
import { at, enumValues, equal, inspectorPaths, mergeLayer, parseAdvanced, validateEditorValue } from "./deployment-data.js";
import { deploymentFieldLabels } from "./deployment-locales.js";
function label(path, t) {
    const key = path.at(-1);
    const item = deploymentFieldLabels[key];
    return item === undefined ? key.replace(/^dsmm-/u, "").replace(/([a-z])([A-Z])/gu, "$1 $2") : item[t("global") === "DSMM 全局配置" ? 1 : 0];
}
function displayValue(value, t) {
    if (value === undefined)
        return t("unknown");
    if (typeof value === "boolean")
        return t(value ? "on" : "off");
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
function AdvancedField({ schema, path, value, inherited, reset, disabled, onChange, setInvalid, t }) {
    const id = useId(), name = path.join(".");
    const serialized = value === undefined ? "" : JSON.stringify(value, null, 2);
    const [text, setText] = useState(serialized);
    const [invalid, setLocalInvalid] = useState(false);
    useEffect(() => { setText(serialized); setLocalInvalid(false); setInvalid(name, false); }, [serialized, reset]);
    return _jsxs("details", { className: "dsmm-deployment-group", children: [_jsxs("summary", { children: [label(path, t), " \u00B7 ", t("advanced"), " ", _jsx("code", { children: name })] }), _jsxs("div", { className: "dsmm-field", children: [_jsxs("label", { htmlFor: id, children: [label(path, t), " \u00B7 ", t("advanced"), " ", _jsx("code", { children: name })] }), _jsx("p", { className: "dsmm-hint", id: `${id}-hint`, children: t("advancedHint") }), _jsx("textarea", { id: id, rows: 6, maxLength: 32768, value: text, disabled: disabled, "aria-invalid": invalid, "aria-describedby": `${id}-hint ${id}-error`, onChange: event => {
                            const next = event.currentTarget.value;
                            setText(next);
                            let parsed, valid = true;
                            try {
                                parsed = parseAdvanced(next);
                                valid = parsed === undefined || validateEditorValue(parsed, schema, true) && validateEditorValue(mergeLayer(inherited, parsed), schema);
                            }
                            catch {
                                valid = false;
                            }
                            setLocalInvalid(!valid);
                            setInvalid(name, !valid);
                            if (valid)
                                onChange(parsed);
                        } }), _jsx("p", { id: `${id}-error`, className: "dsmm-hint", children: invalid ? t("invalid") : "" }), _jsxs("details", { children: [_jsxs("summary", { children: [t("advanced"), " \u00B7 schema"] }), _jsx("pre", { children: JSON.stringify(schema, null, 2) })] })] })] });
}
function ScalarField({ schema, path, controller, disabled, inherited, invalid, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const value = at(state.draft, path), name = path.join("."), id = useId();
    const [text, setText] = useState(String(value ?? inherited ?? ""));
    const [bad, setBad] = useState(false);
    useEffect(() => { setText(String(value ?? inherited ?? "")); setBad(false); invalid(name, false); }, [value, inherited, state.snapshot]);
    return _jsxs(_Fragment, { children: [_jsxs("label", { htmlFor: id, children: [label(path, t), " ", _jsx("code", { children: name })] }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Input, { className: "dsmm-input", id: id, type: "text", inputMode: schema.type === "number" ? "decimal" : undefined, value: text, disabled: disabled, "aria-invalid": bad, "aria-describedby": `${id}-error`, onChange: event => {
                            const raw = event.currentTarget.value;
                            setText(raw);
                            const candidate = schema.type === "number" ? Number(raw) : raw;
                            const valid = (schema.type !== "number" || raw.trim() !== "") && validateEditorValue(candidate, schema);
                            setBad(!valid);
                            invalid(name, !valid);
                            if (valid)
                                controller.edit(path, candidate);
                        } }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled || value === undefined && !bad, onClick: () => { setText(String(inherited ?? "")); setBad(false); invalid(name, false); controller.edit(path, undefined); }, children: t("inherit") })] }), _jsxs("p", { id: `${id}-error`, className: "dsmm-hint", children: [bad ? t("invalid") : "", schema.type === "number" && (schema.min !== undefined || schema.max !== undefined) ? ` ${schema.min ?? "—"} – ${schema.max ?? "—"}` : ""] })] });
}
function Field({ schema, path, controller, invalid, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), snapshot = state.snapshot;
    const id = useId(), name = path.join("."), explicit = at(state.draft, path);
    const inherited = controller.layer === "global" ? at(snapshot.defaults, path) : at(mergeLayer(mergeLayer(snapshot.defaults, snapshot.global), snapshot.nativeForm?.base ?? {}), path);
    const disabled = state.busy || state.issue === "not-owned" || state.issue === "unavailable" || state.issue === "transport" || controller.layer === "profile" && !controller.canWriteProfile();
    const choices = enumValues(schema);
    if (schema.type === "object" && schema.fields !== undefined && path[0] !== "roleRouting" && path[0] !== "lsp")
        return _jsxs("details", { className: "dsmm-deployment-group", children: [_jsxs("summary", { children: [label(path, t), " ", _jsx("code", { children: name })] }), _jsx("div", { children: Object.entries(schema.fields).map(([key, node]) => _jsx(Field, { schema: node, path: [...path, key], controller: controller, invalid: invalid, t: t }, key)) })] });
    if (!["boolean", "string", "number"].includes(schema.type) && choices === null)
        return _jsx(AdvancedField, { schema: schema, path: path, value: explicit, inherited: inherited, reset: snapshot, disabled: disabled, t: t, onChange: value => controller.edit(path, value), setInvalid: invalid });
    return _jsxs("div", { className: "dsmm-field dsmm-deployment-field", children: [schema.type === "boolean" || choices !== null ? _jsxs(_Fragment, { children: [_jsxs("label", { htmlFor: id, children: [label(path, t), " ", _jsx("code", { children: name })] }), _jsxs("select", { id: id, disabled: disabled, value: explicit === undefined ? "inherit" : JSON.stringify(explicit), onChange: event => controller.edit(path, event.currentTarget.value === "inherit" ? undefined : JSON.parse(event.currentTarget.value)), children: [_jsxs("option", { value: "inherit", children: [t("inherit"), " \u00B7 ", displayValue(inherited, t)] }), (choices ?? [true, false]).map(choice => _jsx("option", { value: JSON.stringify(choice), children: displayValue(choice, t) }, String(choice)))] })] }) : _jsx(ScalarField, { schema: schema, path: path, controller: controller, disabled: disabled, inherited: inherited, invalid: invalid, t: t }), (explicit !== undefined || controller.layer === "profile" && at(snapshot.nativeForm?.base, path) !== undefined) && _jsxs("p", { className: "dsmm-hint", children: [explicit === undefined ? "" : equal(explicit, at(snapshot.defaults, path)) ? t("defaultPin") : t("explicit"), controller.layer === "profile" && at(snapshot.nativeForm?.base, path) !== undefined ? `${explicit === undefined ? "" : " · "}${t("hostPin")}` : ""] })] });
}
function Layer({ controller, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const [invalid, setInvalid] = useState(new Set());
    const updateInvalid = (path, bad) => { controller.setInvalid(path, bad); setInvalid(previous => { if (previous.has(path) === bad)
        return previous; const next = new Set(previous); if (bad)
        next.add(path);
    else
        next.delete(path); return next; }); };
    const title = controller.layer === "global" ? "global" : "profile";
    const disabled = state.busy || state.snapshot === null || state.issue !== null || invalid.size > 0 || controller.layer === "profile" && !controller.canWriteProfile();
    return _jsxs("div", { "data-dsmm-layer": controller.layer, "aria-busy": state.busy, children: [_jsxs("details", { className: "dsmm-deployment-card", children: [_jsxs("summary", { children: [t(title), _jsx("span", { role: "status", "aria-live": "polite", className: "dsmm-hint", children: state.busy ? t("saving") : state.dirty ? t("dirty") : state.saved ? t("saved") : "" })] }), _jsxs("fieldset", { children: [_jsx("legend", { children: t(title) }), _jsx("p", { className: "dsmm-hint", children: t(title === "global" ? "globalHint" : "profileHint") }), state.snapshot !== null && Object.entries(state.snapshot.schema.fields ?? {}).filter(([key]) => controller.layer === "global" || key !== "modules").sort(([a], [b]) => a === "modules" ? -1 : b === "modules" ? 1 : 0).map(([key, schema]) => _jsx(Field, { schema: schema, path: [key], controller: controller, invalid: updateInvalid, t: t }, key)), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "primary", disabled: disabled || !state.dirty, onClick: () => { void controller.save(); }, children: t(state.busy ? "saving" : title === "global" ? "saveGlobal" : "saveProfile") }), _jsx(Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => { void controller.refresh(); }, children: t("refresh") }), _jsx(Button, { type: "button", variant: "outline", disabled: state.busy || !state.dirty && state.issue === null, onClick: () => { setInvalid(new Set()); void controller.refresh(true); }, children: t("discard") })] })] })] }), state.issue !== null && _jsx("p", { className: "dsmm-issue", role: "alert", children: t(state.issue) }), invalid.size > 0 && _jsx("p", { className: "dsmm-issue", role: "alert", children: t("invalid") }), controller.layer === "profile" && !controller.canWriteProfile() && _jsx("p", { className: "dsmm-hint", children: t("unavailableForm") })] });
}
function NativeProfileLayer({ namespace, forms, remote, form, core, t }) {
    const shared = useMemo(() => forms.get(namespace), [forms, namespace]);
    const snapshot = useSyncExternalStore(listener => shared.subscribe(listener), () => shared.getSnapshot());
    const controller = useMemo(() => core.forProfile(namespace), [core, remote, namespace]);
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const coreState = useSyncExternalStore(core.subscribe, core.getSnapshot);
    controller.attachForm(form ?? { state: snapshot, mutate: (ops, revision) => shared.mutate(ops, revision) });
    useEffect(() => { void controller.refresh(); return () => controller.dispose(); }, [controller]);
    useEffect(() => { if (state.saved)
        void core.refresh(); }, [state.saved, core]);
    useEffect(() => { if (controller.getSnapshot().snapshot !== null)
        void controller.refresh(); }, [coreState.snapshot?.globalRevision, snapshot.revision, controller]);
    return _jsx(Layer, { controller: controller, t: t });
}
function StateInspector({ controller, session, t }) {
    const { snapshot, dirty, issue } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    if (snapshot === null)
        return null;
    const admitted = session?.configuration ?? null;
    const source = (value) => t(value === "profile" ? "profileSource" : value === "global" ? "globalSource" : value === "defaults" ? "defaultsSource" : value === "named-session" ? "namedSource" : value === "startup" ? "startupSource" : value === "deployment" ? "deploymentCapture" : value === "mixed" ? "mixedSource" : "unknown");
    const value = (layer, path) => layer === undefined ? t("unknown") : at(layer, path.split(".")) === undefined ? t("absent") : displayValue(at(layer, path.split(".")), t);
    const metadata = (layer, path, entry) => layer !== undefined && at(layer, path.split(".")) === undefined && entry === undefined ? t("absent") : source(entry);
    return _jsxs("details", { className: "dsmm-deployment-card", children: [_jsxs("summary", { children: [t("state"), _jsx("span", { className: "dsmm-hint", children: (snapshot.nextRoot?.restartRequired.length ?? 0) > 0 ? t("pending") : dirty || issue !== null ? t("inspectorStale") : "" })] }), _jsxs("div", { children: [_jsx("p", { role: "status", "aria-live": "polite", children: session === null ? t("noSession") : admitted === null ? t("sessionUnavailable") : `${t("namedSource")}: ${admitted.named?.id ?? "—"}` }), session !== null && _jsxs("p", { children: [t("session"), ": ", _jsx("code", { children: session.sessionId }), " \u00B7 ", _jsx("code", { children: session.admissionEpoch }), " \u00B7 ", session.scope] }), (dirty || issue !== null) && _jsx("p", { className: "dsmm-hint", children: t("inspectorStale") }), _jsxs("p", { className: "dsmm-hint", children: ["Global CAS: ", _jsx("code", { children: snapshot.globalRevision }), " \u00B7 native CAS: ", _jsx("code", { children: snapshot.nativeRevision }), " \u00B7 Host form: ", snapshot.nativeFormRevision ?? "—"] }), inspectorPaths(snapshot, admitted).map(path => _jsxs("dl", { className: "dsmm-deployment-state", children: [_jsx("dt", { children: _jsx("code", { children: path }) }), _jsxs("dd", { children: [t("globalSource"), ": ", at(snapshot.global, path.split(".")) === undefined ? t("absent") : t("globalSource")] }), _jsxs("dd", { children: [t("desired"), ": ", value(snapshot.desired, path), " \u00B7 ", metadata(snapshot.desired, path, snapshot.sources[path])] }), _jsxs("dd", { children: [t("startup"), ": ", value(snapshot.startup, path), " \u00B7 ", metadata(snapshot.startup, path, snapshot.startupSources?.[path]), " / ", at(snapshot.startup, path.split(".")) === undefined ? t("absent") : t("startupSource")] }), _jsxs("dd", { children: [t("next"), ": ", value(snapshot.nextRoot?.settings, path), " \u00B7 ", metadata(snapshot.nextRoot?.settings, path, snapshot.nextRoot?.sources[path]), " / ", metadata(snapshot.nextRoot?.settings, path, snapshot.nextRoot?.captures[path])] }), _jsxs("dd", { children: [t("session"), ": ", value(admitted?.settings, path), " \u00B7 ", metadata(admitted?.settings, path, admitted?.sources[path]), " / ", metadata(admitted?.settings, path, admitted?.captures[path])] })] }, path)), (snapshot.nextRoot?.restartRequired.length ?? 0) > 0 && _jsxs("p", { children: [t("pending"), ": ", snapshot.nextRoot.restartRequired.join(", ")] })] })] });
}
export function DeploymentPage(props) {
    const state = useSyncExternalStore(props.core.subscribe, props.core.getSnapshot);
    useEffect(() => { if (props.view === "page")
        void props.core.refresh(); }, [props.core, props.view]);
    if (props.view === "summary")
        return _jsx("span", { children: props.t("summary") });
    const { t } = props, snapshot = state.snapshot, module = snapshot?.modules[0];
    return _jsxs("section", { className: "dsmm-profiles dsmm-deployment", "data-dsmm-page": true, "aria-label": t("title"), children: [_jsx("p", { className: "dsmm-hint", children: t("description") }), _jsx("p", { className: "dsmm-hint", children: t("boundaries") }), _jsxs("details", { className: "dsmm-deployment-card", children: [_jsxs("summary", { children: [t("module"), _jsx("span", { className: "dsmm-hint", children: module?.pending ? t("pending") : module === undefined ? t("unknown") : t(module.desired.enabled ? "on" : "off") })] }), _jsxs("div", { children: [_jsx("p", { children: t("hostUnknown") }), _jsxs("p", { children: [t("desired"), ": ", module === undefined ? t("unknown") : t(module.desired.enabled ? "on" : "off"), " \u00B7 ", module?.desired.source ?? "—"] }), _jsxs("p", { children: [t("startup"), ": ", module === undefined ? t("unknown") : t(module.startupMounted ? "on" : "off"), " \u00B7 ", t("next"), ": ", module === undefined ? t("unknown") : t(module.nextRoot.admitted ? "on" : "off")] }), _jsxs("p", { children: [t("session"), ": ", state.session?.modules?.[0]?.admitted == null ? t("unknown") : t(state.session.modules[0].admitted ? "on" : "off")] }), _jsx("p", { className: "dsmm-hint", children: t("ceiling") })] })] }), _jsx(Layer, { controller: props.core, t: t }), props.profilePage && props.forms !== undefined && snapshot?.namespace !== null && snapshot?.namespace !== undefined && (props.rowNamespace === undefined || props.rowNamespace === snapshot.namespace)
                ? _jsx(NativeProfileLayer, { namespace: snapshot.namespace, forms: props.forms, remote: props.remote, form: props.form, core: props.core, t: t }, `${snapshot.hostProfileKey}:${snapshot.entryId}`)
                : _jsxs("div", { children: [_jsxs("details", { className: "dsmm-deployment-card", children: [_jsxs("summary", { children: [t("profile"), _jsx("span", { className: "dsmm-hint", children: t("profileUnavailable") })] }), _jsx("div", { children: _jsx("p", { children: t("profileHint") }) })] }), _jsx("p", { className: "dsmm-hint", children: t("unavailableForm") })] }), _jsx(StateInspector, { controller: props.core, session: state.session, t: t })] });
}
//# sourceMappingURL=DeploymentPage.js.map