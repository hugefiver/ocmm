import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useId, useSyncExternalStore } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { at, enumValues, equal, mergeLayer, parseAdvanced, validateEditorValue } from "./deployment-data.js";
import { deploymentFieldLabels } from "./deployment-locales.js";
import { permissionEn, permissionZh } from "./permission-locales.js";
import { NativeCommandEntries } from "./NativeCommandEntries.js";
export const permissionText = (t) => (key) => (t("global") === "DSMM 全局配置" ? permissionZh : permissionEn)[key];
export function fieldLabel(path, t) {
    const key = path.at(-1);
    if (path[0] === "permissionControl" && ["outsideReads", "webSearch", "webFetch", "rules", "nativeCommands", "rule"].includes(key))
        return permissionText(t)(key);
    const item = deploymentFieldLabels[key];
    return item === undefined ? key.replace(/^dsmm-/u, "").replace(/([a-z])([A-Z])/gu, "$1 $2") : item[t("global") === "DSMM 全局配置" ? 1 : 0];
}
export function displayValue(value, t) {
    if (value === undefined)
        return t("unknown");
    if (typeof value === "boolean")
        return t(value ? "on" : "off");
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
export function AdvancedField({ schema, path, controller, inherited, upper, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), id = useId(), name = path.join(".");
    const value = at(state.draft, path), raw = state.raw[name], text = raw?.text ?? (value === undefined ? "" : JSON.stringify(value, null, 2)), invalid = raw?.invalid === true;
    return _jsxs("details", { className: "dsmm-deployment-group", "data-field": name, children: [_jsxs("summary", { children: [fieldLabel(path, t), " \u00B7 ", t("advanced")] }), _jsxs("div", { className: "dsmm-field", children: [_jsxs("label", { htmlFor: id, children: [fieldLabel(path, t), " \u00B7 ", t("advanced")] }), _jsx("p", { className: "dsmm-hint", id: `${id}-hint`, children: t("advancedHint") }), path[0] === "permissionControl" && _jsx("p", { className: "dsmm-hint", children: permissionText(t)("configRulesHint") }), _jsx("p", { className: "dsmm-hint", children: t(value === undefined ? "inherit" : "explicit") }), upper !== undefined && _jsxs("p", { className: "dsmm-hint", children: [t("profileSource"), ": ", displayValue(upper, t)] }), _jsx("textarea", { id: id, rows: 6, maxLength: 32768, value: text, disabled: !controller.canEdit(), "aria-invalid": invalid, "aria-describedby": `${id}-hint ${id}-error`, onChange: event => {
                            const next = event.currentTarget.value;
                            let parsed, valid = true;
                            try {
                                parsed = parseAdvanced(next);
                                const candidate = parsed === undefined ? inherited : mergeLayer(inherited, parsed);
                                valid = parsed === undefined || validateEditorValue(parsed, schema, true) && validateEditorValue(upper === undefined ? candidate : mergeLayer(candidate, upper), schema);
                            }
                            catch {
                                valid = false;
                            }
                            controller.setRaw(name, next, !valid);
                            if (valid)
                                controller.edit(path, parsed);
                        } }), _jsx("p", { id: `${id}-error`, className: "dsmm-hint", children: invalid ? t("invalid") : "" }), _jsx(Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: !controller.canEdit() || value === undefined && raw === undefined, onClick: () => { controller.clearRaw(name); controller.edit(path, undefined); }, children: t("unset") }), _jsxs("details", { children: [_jsx("summary", { children: t("inherit") }), _jsx("pre", { children: JSON.stringify(inherited, null, 2) })] }), _jsxs("details", { children: [_jsx("summary", { children: "schema" }), _jsx("pre", { children: JSON.stringify(schema, null, 2) })] })] })] });
}
export function ScalarField({ schema, path, controller, inherited, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), id = useId(), name = path.join(".");
    const value = at(state.draft, path), raw = state.raw[name], bad = raw?.invalid === true;
    return _jsxs(_Fragment, { children: [_jsx("label", { htmlFor: id, children: fieldLabel(path, t) }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Input, { className: "dsmm-input", id: id, type: "text", inputMode: schema.type === "number" ? "decimal" : undefined, value: raw?.text ?? String(value ?? inherited ?? ""), disabled: !controller.canEdit(), "aria-invalid": bad, "aria-describedby": `${id}-error`, onChange: event => {
                            const text = event.currentTarget.value, candidate = schema.type === "number" ? Number(text) : text;
                            const valid = (schema.type !== "number" || text.trim() !== "") && validateEditorValue(candidate, schema);
                            controller.setRaw(name, text, !valid);
                            if (valid)
                                controller.edit(path, candidate);
                        } }), _jsx(Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: !controller.canEdit() || value === undefined && raw === undefined, onClick: () => { controller.clearRaw(name); controller.edit(path, undefined); }, children: t("unset") })] }), _jsxs("p", { id: `${id}-error`, className: "dsmm-hint", children: [bad ? t("invalid") : "", schema.type === "number" && (schema.min !== undefined || schema.max !== undefined) ? ` ${schema.min ?? "—"} – ${schema.max ?? "—"}` : ""] })] });
}
export function Field({ schema, path, controller, t }) {
    if (schema.type === "transform" && schema.inner !== undefined)
        schema = schema.inner;
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), snapshot = state.snapshot, id = useId(), name = path.join(".");
    const explicit = at(state.draft, path), inherited = controller.layer === "global" ? at(snapshot.defaults, path) : at(mergeLayer(mergeLayer(snapshot.defaults, snapshot.global), snapshot.nativeForm?.base ?? {}), path);
    const choices = enumValues(schema), disabled = !controller.canEdit();
    if (name === "permissionControl.nativeCommands.entries")
        return _jsx("div", { "data-field": name, children: _jsx(NativeCommandEntries, { controller: controller, value: explicit, inherited: (inherited ?? []), disabled: disabled, onChange: value => controller.edit(path, value), setInvalid: (key, bad) => controller.setInvalid(key, bad), t: permissionText(t) }) });
    if (schema.type === "object" && schema.fields !== undefined && path[0] !== "roleRouting")
        return _jsxs("details", { className: "dsmm-deployment-group", "data-field": name, children: [_jsx("summary", { children: fieldLabel(path, t) }), _jsxs("div", { children: [name === "permissionControl" && _jsx("p", { className: "dsmm-hint", children: permissionText(t)("configPolicyHint") }), _jsx("p", { className: "dsmm-hint", children: t(explicit === undefined ? "inherit" : "explicit") }), _jsx(Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: disabled || explicit === undefined && !Object.keys(state.raw).some(key => key === name || key.startsWith(`${name}.`)), onClick: () => { controller.clearRaw(name); controller.edit(path, undefined); }, children: t("unsetGroup") }), Object.entries(schema.fields).map(([key, node]) => _jsx(Field, { schema: node, path: [...path, key], controller: controller, t: t }, key))] })] });
    if (!["boolean", "string", "number"].includes(schema.type) && choices === null)
        return _jsx(AdvancedField, { schema: schema, path: path, controller: controller, inherited: inherited, upper: controller.layer === "global" ? at(snapshot.profile, path) : undefined, t: t });
    return _jsxs("div", { className: "dsmm-field dsmm-deployment-field", "data-field": name, children: [schema.type === "boolean" || choices !== null ? _jsxs(_Fragment, { children: [_jsx("label", { htmlFor: id, children: fieldLabel(path, t) }), _jsxs("select", { id: id, disabled: disabled, value: explicit === undefined ? "inherit" : JSON.stringify(explicit), onChange: event => controller.edit(path, event.currentTarget.value === "inherit" ? undefined : JSON.parse(event.currentTarget.value)), children: [_jsx("option", { value: "inherit", children: `${t("unset")} · ${displayValue(inherited, t)}` }), (choices ?? [true, false]).map(choice => _jsx("option", { value: JSON.stringify(choice), children: displayValue(choice, t) }, String(choice)))] })] }) : _jsx(ScalarField, { schema: schema, path: path, controller: controller, inherited: inherited, t: t }), name === "modelParameters.passthrough" && _jsx("p", { className: "dsmm-hint", children: t("modelParametersHint") }), name === "permissionControl.enabled" && _jsx("p", { className: "dsmm-hint", children: permissionText(t)("coldHint") }), explicit !== undefined && _jsx("p", { className: "dsmm-hint", children: t(equal(explicit, at(snapshot.defaults, path)) ? "defaultPin" : "explicit") }), controller.layer === "profile" && at(snapshot.nativeForm?.base, path) !== undefined && _jsx("p", { className: "dsmm-hint", children: t("hostPin") }), controller.layer === "global" && at(snapshot.profile, path) !== undefined && _jsxs("p", { className: "dsmm-hint", children: [t("profileSource"), ": ", displayValue(at(snapshot.profile, path), t), " \u00B7 ", t("explicit")] })] });
}
//# sourceMappingURL=DeploymentFields.js.map