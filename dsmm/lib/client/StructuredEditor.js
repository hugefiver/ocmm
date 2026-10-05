import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useState } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { DSMM_RATE_LIMIT_BOUNDS, normalizeRateLimitPolicy } from "../routing-policy.js";
import { structuredDocument } from "./structured.js";
import { RETRY_FIELD_LABEL_KEYS } from "./locales.js";
const MANUAL = "__dsmm_manual__";
function RetryNumber({ id, name, field, value, inherited, path, disabled, actions, t }) {
    const [draft, setDraft] = useState(value === undefined ? "" : String(value));
    const [invalid, setInvalid] = useState(false);
    const [min, max] = DSMM_RATE_LIMIT_BOUNDS[field];
    const key = path.join(".");
    useEffect(() => { setDraft(value === undefined ? "" : String(value)); setInvalid(false); }, [value]);
    useEffect(() => { actions.setFieldInvalid(key, invalid); return () => actions.setFieldInvalid(key, false); }, [actions.setFieldInvalid, key, invalid]);
    return _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: id, children: t("retryField", { name, field: t(RETRY_FIELD_LABEL_KEYS[field]) }) }), _jsx(Input, { id: id, "data-dsmm-policy-field": field, className: "dsmm-input", type: "number", inputMode: "numeric", min: min, max: max, step: 1, disabled: disabled, value: draft, placeholder: inherited === undefined ? t("unknownDefault") : t("inheritNumber", { value: inherited }), "aria-invalid": invalid || undefined, "aria-describedby": `${id}-hint${invalid ? ` ${id}-invalid` : ""}`, onChange: (event) => {
                    const input = event.currentTarget;
                    setDraft(input.value);
                    const valid = input.validity.valid && (input.value === "" || Number.isSafeInteger(input.valueAsNumber));
                    setInvalid(!valid);
                    actions.setFieldInvalid(key, !valid);
                    if (valid)
                        actions.editPath(path, input.value === "" ? undefined : input.valueAsNumber);
                } }), _jsx("p", { className: "dsmm-hint", id: `${id}-hint`, children: t("retryBounds", { min, max, value: inherited ?? t("unknownDefault") }) }), invalid && _jsx("p", { id: `${id}-invalid`, children: t("invalidNumber") })] });
}
function RouteFields({ value, path, name, catalog, disabled, edit, editRoute, t }) {
    const prefix = useId();
    const providers = catalog?.groups ?? [];
    const group = providers.find((candidate) => candidate.id === value.provider);
    const model = group?.models.find((candidate) => candidate.id === value.model);
    const efforts = model?.reasoning?.efforts ?? [];
    const providerListed = group !== undefined;
    const modelListed = model !== undefined;
    const updateModel = (provider, modelId) => {
        // This is an explicit user change, not a catalog refresh. Clear only this
        // route's adapter-owned effort; do not save or touch the native model default.
        editRoute(path, provider, modelId);
    };
    return _jsxs("div", { className: "dsmm-route-fields", children: [_jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-provider`, children: t("routeProvider", { name }) }), _jsxs("select", { id: `${prefix}-provider`, disabled: disabled, value: providerListed ? value.provider : MANUAL, onChange: (event) => updateModel(event.currentTarget.value === MANUAL ? "" : event.currentTarget.value, ""), children: [_jsx("option", { value: MANUAL, children: providerListed ? t("manual") : t("manualValue", { value: value.provider || t("unset") }) }), providers.map((provider) => _jsxs("option", { value: provider.id, children: [provider.name, " (", provider.id, ")"] }, provider.id))] }), !providerListed && _jsx(Input, { "aria-label": t("manualProvider", { name }), className: "dsmm-input", value: value.provider, disabled: disabled, onChange: (event) => updateModel(event.currentTarget.value, value.model) })] }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-model`, children: t("routeModel", { name }) }), _jsxs("select", { id: `${prefix}-model`, disabled: disabled, value: modelListed ? value.model : MANUAL, onChange: (event) => updateModel(value.provider, event.currentTarget.value === MANUAL ? "" : event.currentTarget.value), children: [_jsx("option", { value: MANUAL, children: modelListed ? t("manual") : t("manualValue", { value: value.model || t("unset") }) }), group?.models.map((candidate) => _jsxs("option", { value: candidate.id, children: [candidate.name, " (", candidate.id, ")"] }, candidate.id))] }), !modelListed && _jsx(Input, { "aria-label": t("manualModel", { name }), className: "dsmm-input", value: value.model, disabled: disabled, onChange: (event) => updateModel(value.provider, event.currentTarget.value) })] }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-effort`, children: t("routeEffort", { name }) }), _jsxs("select", { id: `${prefix}-effort`, disabled: disabled, value: value.reasoningEffort ?? "", onChange: (event) => edit([...path, "reasoningEffort"], event.currentTarget.value || undefined), children: [_jsx("option", { value: "", children: t("effortDefault") }), value.reasoningEffort !== undefined && !efforts.some((effort) => effort.id === value.reasoningEffort) && _jsx("option", { value: value.reasoningEffort, children: t("manualValue", { value: value.reasoningEffort }) }), efforts.map((effort) => _jsxs("option", { value: effort.id, children: [effort.name, " (", effort.id, ")"] }, effort.id))] }), _jsx(Input, { "aria-label": t("manualEffort", { name }), className: "dsmm-input", value: value.reasoningEffort ?? "", disabled: disabled, placeholder: t("effortDefault"), onChange: (event) => edit([...path, "reasoningEffort"], event.currentTarget.value || undefined) })] })] });
}
function PolicyFields({ value, inherited, path, name, disabled, actions, t }) {
    const prefix = useId();
    return _jsxs("div", { className: "dsmm-policy-fields", children: [_jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-strategy`, children: t("strategy", { name }) }), _jsxs("select", { id: `${prefix}-strategy`, disabled: disabled, value: value.strategy ?? "", onChange: (event) => actions.editPath([...path, "strategy"], event.currentTarget.value || undefined), children: [_jsx("option", { value: "", children: t("inheritStrategy", { value: inherited?.strategy ?? t("unknownDefault") }) }), _jsx("option", { value: "startup-lock", children: t("startupLock") }), _jsx("option", { value: "rate-limit-fallback", children: t("rateFallback") })] })] }), _jsx("p", { className: "dsmm-hint", children: t("strategyHint") }), _jsx("div", { className: "dsmm-route-fields", children: Object.keys(DSMM_RATE_LIMIT_BOUNDS).map((field) => _jsx(RetryNumber, { id: `${prefix}-${field}`, t: t, name: name, field: field, value: value.rateLimit?.[field], inherited: inherited?.rateLimit[field], path: [...path, "rateLimit", field], disabled: disabled, actions: actions }, field)) })] });
}
/** The same raw draft drives every control; there is no form-to-document rewrite. */
export function StructuredEditor({ state, actions, disabled, t }) {
    const prefix = useId();
    const [selectedRole, setSelectedRole] = useState("dsmm-orchestrator");
    const document = state.editor === null ? null : structuredDocument(state.editor.content);
    if (document === null)
        return _jsx("p", { className: "dsmm-hint", "data-dsmm-structured-invalid": true, children: t("rawInvalid") });
    const roles = state.snapshot?.roles ?? [];
    const role = roles.find((candidate) => candidate.id === selectedRole) ?? roles[0];
    const policy = role === undefined ? undefined : document.roleRouting[role.id] ?? {};
    const baseline = state.snapshot?.editorDefaults;
    let inherited;
    try {
        if (baseline !== undefined) {
            const profileDefaults = { strategy: document.runtimePolicy.strategy ?? baseline.strategy, rateLimit: normalizeRateLimitPolicy(document.runtimePolicy.rateLimit, baseline.rateLimit) };
            inherited = { strategy: role?.runtimePolicy?.strategy ?? profileDefaults.strategy, rateLimit: normalizeRateLimitPolicy(role?.runtimePolicy?.rateLimit, profileDefaults.rateLimit) };
        }
    }
    catch { /* Invalid effective values remain a raw/Host validation error. */ }
    const rolePath = ["settings", "roleRouting", role?.id ?? ""];
    return _jsxs("div", { className: "dsmm-structured", "data-dsmm-structured": true, children: [_jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-label`, children: t("profileLabel") }), _jsx(Input, { id: `${prefix}-label`, className: "dsmm-input", value: document.label ?? "", disabled: disabled, onChange: (event) => actions.editPath(["label"], event.currentTarget.value || undefined) })] }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-active`, children: t("defaultActive") }), _jsxs("select", { id: `${prefix}-active`, disabled: disabled, value: document.settings.defaultActive === undefined ? "" : String(document.settings.defaultActive), onChange: (event) => actions.editPath(["settings", "defaultActive"], event.currentTarget.value === "" ? undefined : event.currentTarget.value === "true"), children: [_jsx("option", { value: "", children: t("inherit") }), _jsx("option", { value: "true", children: t("enabled") }), _jsx("option", { value: "false", children: t("disabled") })] }), _jsx("p", { className: "dsmm-hint", children: t("activeHint") })] }), _jsxs("fieldset", { children: [_jsx("legend", { children: t("profileDefaults") }), _jsx(PolicyFields, { t: t, value: document.runtimePolicy, inherited: baseline, path: ["settings", "runtimePolicy"], name: t("profileDefaults"), disabled: disabled, actions: actions })] }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-role`, children: t("roleSelect") }), _jsxs("select", { id: `${prefix}-role`, disabled: disabled || roles.length === 0 || state.invalidFields.length > 0, value: role?.id ?? "", onChange: (event) => setSelectedRole(event.currentTarget.value), children: [roles.length === 0 && _jsx("option", { value: "", children: t("rolesUnavailable") }), roles.map((candidate) => _jsxs("option", { value: candidate.id, children: [candidate.label, candidate.enabled ? "" : ` — ${t("roleDisabled")}`] }, candidate.id))] })] }), role !== undefined && policy !== undefined && _jsxs("fieldset", { "data-dsmm-role": role.id, children: [_jsx("legend", { children: role.label }), _jsx("p", { className: "dsmm-hint", children: t(role.enabled ? "roleEnabled" : "roleDisabled") }), _jsx(PolicyFields, { t: t, value: policy, inherited: inherited, path: rolePath, name: role.label, disabled: disabled, actions: actions }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-primary-mode`, children: t("primaryMode", { name: role.label }) }), _jsxs("select", { id: `${prefix}-primary-mode`, disabled: disabled, value: policy.primary === undefined ? "inherit" : "explicit", onChange: (event) => actions.editPath([...rolePath, "primary"], event.currentTarget.value === "inherit" ? undefined : { provider: "", model: "" }), children: [_jsx("option", { value: "inherit", children: t("inheritRoute") }), _jsx("option", { value: "explicit", children: t("configuredRoute") })] })] }), policy.primary !== undefined && _jsx(RouteFields, { t: t, value: policy.primary, path: [...rolePath, "primary"], name: t("primaryName", { name: role.label }), catalog: state.catalog, disabled: disabled, edit: actions.editPath, editRoute: actions.editRoute }), _jsx("p", { className: "dsmm-hint", children: t("effortChangeHint") }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-fallback-mode`, children: t("fallbackMode", { name: role.label }) }), _jsxs("select", { id: `${prefix}-fallback-mode`, disabled: disabled, value: policy.fallbackRoutes === undefined ? "inherit" : "explicit", onChange: (event) => actions.editPath([...rolePath, "fallbackRoutes"], event.currentTarget.value === "inherit" ? undefined : []), children: [_jsx("option", { value: "inherit", children: t("inheritChain") }), _jsx("option", { value: "explicit", children: t("configuredChain") })] })] }), policy.fallbackRoutes?.length === 0 && _jsx("p", { className: "dsmm-hint", children: t("emptyChain") }), policy.fallbackRoutes?.map((candidate, index) => {
                        const name = t("fallbackName", { name: role.label, index: index + 1 });
                        return _jsxs("fieldset", { children: [_jsx("legend", { children: name }), _jsx(RouteFields, { t: t, value: candidate, path: [...rolePath, "fallbackRoutes", index], name: name, catalog: state.catalog, disabled: disabled, edit: actions.editPath, editRoute: actions.editRoute }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", disabled: disabled || index === 0, onClick: () => actions.moveFallback(role.id, index, index - 1), children: t("moveUp", { name }) }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled || index === policy.fallbackRoutes.length - 1, onClick: () => actions.moveFallback(role.id, index, index + 1), children: t("moveDown", { name }) }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled, onClick: () => actions.editPath([...rolePath, "fallbackRoutes", index], undefined), children: t("removeFallback", { name }) })] })] }, index);
                    }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled || (policy.fallbackRoutes?.length ?? 0) >= 32, onClick: () => {
                            if (policy.fallbackRoutes === undefined)
                                actions.editPath([...rolePath, "fallbackRoutes"], [{ provider: "", model: "" }]);
                            else
                                actions.editPath([...rolePath, "fallbackRoutes", policy.fallbackRoutes.length], { provider: "", model: "" });
                        }, children: t("addFallback", { name: role.label }) })] })] });
}
//# sourceMappingURL=StructuredEditor.js.map