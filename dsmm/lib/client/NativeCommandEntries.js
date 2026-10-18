import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId, useSyncExternalStore } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { parseNativeCommands } from "../permission-settings.js";
import { parseAdvanced } from "./deployment-data.js";
export function validNativeEntries(entries) {
    try {
        parseNativeCommands({ entries });
        return true;
    }
    catch {
        return false;
    }
}
export function emptyNativeEntry() {
    return { id: "", mode: "ask", sandboxMode: "workspace-write", match: { tool: "bash", executable: "", args: [], workingDirectory: "" } };
}
function Arguments({ value, controller, name, disabled, onChange, t }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), id = useId(), raw = state.raw[name], text = raw?.text ?? JSON.stringify(value), bad = raw?.invalid === true;
    return _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: id, children: t("args") }), _jsx("textarea", { id: id, rows: 3, maxLength: 32768, disabled: disabled, value: text, "aria-invalid": bad, "aria-describedby": `${id}-error`, onChange: event => {
                    const raw = event.currentTarget.value;
                    let parsed;
                    try {
                        parsed = parseAdvanced(raw);
                    }
                    catch { /* Keep invalid text local until corrected. */ }
                    const valid = Array.isArray(parsed) && parsed.every(item => typeof item === "string" && item.trim() !== "" && !item.includes("\0") && item.length <= 32768);
                    controller.setRaw(name, raw, !valid);
                    if (valid)
                        onChange(parsed);
                } }), _jsx("p", { id: `${id}-error`, className: "dsmm-hint", children: bad ? t("invalidEntry") : "" })] });
}
function Entry({ entry, index, controller, disabled, removeDisabled, change, remove, t }) {
    const id = useId();
    const valid = validNativeEntries([entry]);
    const text = (key, label) => _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${id}-${key}`, children: t(label) }), _jsx(Input, { className: "dsmm-input", id: `${id}-${key}`, value: key === "id" ? entry.id : entry.match[key] ?? "", maxLength: 32768, disabled: disabled, required: key !== "subcommand", onChange: event => {
                    const value = event.currentTarget.value;
                    if (key === "id")
                        change({ ...entry, id: value });
                    else if (key === "subcommand" && value === "") {
                        const { subcommand: _omitted, ...match } = entry.match;
                        change({ ...entry, match });
                    }
                    else
                        change({ ...entry, match: { ...entry.match, [key]: value } });
                } })] });
    return _jsxs("fieldset", { "aria-describedby": !valid ? `${id}-error` : undefined, children: [_jsxs("legend", { children: [t("nativeCommands"), " ", index + 1] }), !valid && _jsx("p", { className: "dsmm-hint", id: `${id}-error`, children: t("invalidEntry") }), text("id", "entryId"), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${id}-tool`, children: t("tool") }), _jsx("select", { id: `${id}-tool`, disabled: disabled, value: entry.match.tool, onChange: event => {
                            const tool = event.currentTarget.value;
                            if (tool === "bash" || tool === "pwsh")
                                change({ ...entry, match: { ...entry.match, tool } });
                        }, children: ["bash", "pwsh"].map(value => _jsx("option", { value: value, children: value }, value)) })] }), text("executable", "nativeExecutable"), text("subcommand", "subcommand"), _jsx(Arguments, { value: entry.match.args, controller: controller, name: `permissionControl.nativeCommands.entries.${index}.args`, disabled: disabled, t: t, onChange: args => change({ ...entry, match: { ...entry.match, args } }) }), text("workingDirectory", "cwd"), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${id}-sandbox`, children: t("sandboxMode") }), _jsxs("select", { id: `${id}-sandbox`, disabled: disabled, value: entry.sandboxMode, onChange: event => {
                            if (event.currentTarget.value === "workspace-write")
                                change({ ...entry, sandboxMode: "workspace-write" });
                        }, children: [_jsx("option", { value: "workspace-write", children: "workspace-write" }), entry.sandboxMode === "danger-full-access" && _jsxs("option", { value: "danger-full-access", disabled: true, children: ["danger-full-access (", t("source"), ")"] })] })] }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${id}-mode`, children: t("mode") }), _jsxs("select", { id: `${id}-mode`, disabled: disabled, value: entry.mode, onChange: event => {
                            const mode = event.currentTarget.value;
                            if (mode === "ask" || mode === "allow")
                                change({ ...entry, mode });
                        }, children: [_jsx("option", { value: "ask", children: t("action:ask") }), _jsx("option", { value: "allow", children: t("action:allow") })] })] }), _jsxs(Button, { type: "button", variant: "outline", disabled: disabled || removeDisabled, onClick: remove, children: [t("removeEntry"), " ", index + 1] })] });
}
export function NativeCommandEntries({ value, inherited, controller, disabled, onChange, setInvalid, t }) {
    const entries = value ?? inherited, name = "permissionControl.nativeCommands.entries";
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const invalidArgs = state.invalidFields.filter(path => path.startsWith(`${name}.`) && path.endsWith(".args"));
    const valid = validNativeEntries(entries);
    const change = (next) => { setInvalid(name, !validNativeEntries(next ?? inherited)); onChange(next); };
    return _jsxs("details", { className: "dsmm-deployment-group", children: [_jsxs("summary", { children: [t("nativeCommands"), " ", _jsx("code", { children: name })] }), _jsxs("div", { className: "dsmm-structured", children: [_jsx("p", { className: "dsmm-hint", children: t("nativeCommandsHint") }), _jsx("p", { className: "dsmm-hint", children: t("registrationUnresolved") }), _jsx("p", { className: "dsmm-hint", children: t(value === undefined ? "inheritedEntries" : "explicitEntries") }), !valid && _jsx("p", { className: "dsmm-issue", role: "alert", children: t("invalidEntry") }), invalidArgs.length > 0 && _jsx("p", { className: "dsmm-hint", children: t("invalidArgsHint") }), entries.length === 0 && _jsx("p", { children: t("noEntries") }), entries.map((entry, index) => _jsx(Entry, { entry: entry, index: index, controller: controller, disabled: disabled, removeDisabled: invalidArgs.length > 0, t: t, change: next => change(entries.map((row, position) => position === index ? next : row)), remove: () => { controller.clearRaw(name); change(entries.filter((_, position) => position !== index)); } }, index)), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", disabled: disabled || entries.length >= 1024, onClick: () => change([...entries, emptyNativeEntry()]), children: t("addEntry") }), _jsx(Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: disabled || value === undefined && invalidArgs.length === 0, onClick: () => { controller.clearRaw(name); change(undefined); }, children: t("unset") })] })] })] });
}
//# sourceMappingURL=NativeCommandEntries.js.map