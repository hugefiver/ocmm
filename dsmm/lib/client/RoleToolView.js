import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button, CodeBlock, DisclosureRow, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { actualRoleTool, preparingRoleTool, requestedRoleTool, roleToolDisplay, roleToolKeys } from "./RoleToolView-data.js";
import { ROLE_TOOL_NS, roleToolEn, roleToolZh } from "./RoleToolView-locales.js";
const styles = `
.dsmm-role-tool{min-width:0;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px;line-height:22px}
.dsmm-role-tool .dsmm-role-heading{color:var(--dsw-alias-label-primary);height:auto;min-height:32px}
.dsmm-role-tool .dsmm-role-title{white-space:normal;overflow-wrap:anywhere;min-width:0;max-width:100%;color:inherit;font-size:inherit;line-height:inherit}
.dsmm-role-tool .dsmm-role-text{flex:1;min-width:0}
.dsmm-role-tool .dsmm-role-body{display:flex;flex-direction:column;gap:12px;min-width:0;padding:8px 0}
.dsmm-role-tool p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.dsmm-role-tool .dsmm-role-status{color:var(--dsw-alias-label-secondary)}
.dsmm-role-tool .dsmm-role-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dsmm-role-tool :is(button,[role=button]):focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
`;
export function RoleToolView(props) {
    const { expanded, toggle } = props.useDisclosure();
    const partial = props.phase === "preparing" ? preparingRoleTool(props.toolName, props.block.args) : undefined;
    const { t } = props;
    const raw = props.phase === "preparing" ? partial.preview : props.phase === "start" ? props.block.argsRaw : props.block.call?.argsRaw ?? "";
    const requested = partial?.requested ?? requestedRoleTool(props.toolName, raw);
    const result = props.phase === "result" ? props.block : undefined;
    const failed = result !== undefined && (result.isError || result.error != null);
    const actual = result === undefined ? undefined : actualRoleTool(props.toolName, result.meta, failed);
    const target = actual?.role ?? requested.target;
    const title = `${t("call")} ${target === undefined ? t("unknownTarget") : roleToolDisplay(target)}${(actual?.level ?? requested.level) === undefined ? "" : ` · ${actual?.level ?? requested.level}`}`;
    const state = result?.error?.code === "interrupted" ? "stopped" : failed ? "error" : result === undefined ? props.phase === "preparing" ? "preparing" : "running" : actual?.jobId !== undefined || actual?.mode === "continuable" ? "background" : "result";
    const code = (value) => _jsx(CodeBlock, { code: value, copyLabel: t("copy"), copiedLabel: t("copied") });
    return _jsxs("div", { className: "dsmm-role-tool", "data-dsmm-role-tool": props.toolName, "data-identity": actual === undefined ? "requested" : "actual", "data-state": state, children: [_jsx(DisclosureRow, { title: title, titleClassName: "dsmm-role-title", rowClassName: "dsmm-role-heading", contentClassName: "dsmm-role-text", icon: _jsx(StateDot, { state: state === "error" ? "error" : state === "stopped" ? "warning" : result === undefined ? "ongoing" : state === "background" ? "idle" : "done" }), open: expanded, expandable: true, onToggle: toggle, expandOnRowClick: true, children: _jsxs("div", { className: "dsmm-role-body", children: [_jsxs("p", { children: [props.toolName, " \u00B7 ", props.callId] }), _jsxs("p", { className: "dsmm-role-status", children: [t("requested"), " ", t(requested.kind), ": ", requested.target === undefined ? t("unknown") : roleToolDisplay(requested.target)] }), requested.description !== undefined && _jsx("p", { className: "dsmm-role-status", children: requested.description }), actual !== undefined && _jsxs(_Fragment, { children: [_jsxs("p", { children: [t("actual"), " ", t(requested.kind), ": ", roleToolDisplay(actual.role), " \u00B7 ", t("level"), ": ", actual.level] }), _jsxs("p", { children: [t("routeSource"), ": ", actual.routeSource, " \u00B7 ", t("route"), ": ", actual.route === undefined ? t("unknown") : `${actual.route.provider}/${actual.route.model}${actual.route.reasoningEffort === undefined ? "" : ` · ${actual.route.reasoningEffort}`}`] })] }), _jsxs("div", { children: [_jsx("p", { children: t(props.phase === "preparing" ? "preparingArgs" : "args") }), raw === "" ? _jsx("p", { children: t("emptyArgs") }) : code(raw)] }), result !== undefined && _jsxs(_Fragment, { children: [actual === undefined && _jsx("p", { children: t("unavailable") }), _jsxs("div", { children: [_jsx("p", { children: t("output") }), code(JSON.stringify(result.content, null, 2))] }), result.error != null && _jsxs("div", { children: [_jsx("p", { children: t("failure") }), code(JSON.stringify(result.error, null, 2))] }), result.meta != null && _jsxs("div", { children: [_jsx("p", { children: t("metadata") }), code(JSON.stringify(result.meta, null, 2))] })] })] }) }), _jsxs("div", { className: "dsmm-role-actions", children: [_jsx("p", { className: "dsmm-role-status", role: "status", children: t(state) }), props.inspect !== undefined && _jsx(Button, { variant: "ghost", size: "sm", onClick: props.inspect, children: t("inspect") })] })] });
}
/** Called once by the parent client apply(ctx), alongside the other slot registrations. */
export function registerRoleToolViews(ctx) {
    ctx.effect(() => ctx.locale.register(ROLE_TOOL_NS, { en: roleToolEn, zh: roleToolZh }), "dsmm: role tool locale");
    ctx.effect(() => {
        const style = document.createElement("style");
        style.dataset.dsmmRoleToolStyles = "";
        style.textContent = styles;
        document.head.append(style);
        return () => style.remove();
    }, "dsmm: role tool styles");
    ctx.slots.inject("tool.call.toolview", () => {
        const disposers = [...Object.keys(roleToolKeys), "dsmm_role", "dsmm_category"].map(key => ctx.slots.register({ name: "tool.call.toolview", key, locale: ROLE_TOOL_NS }, RoleToolView));
        return () => { for (const dispose of disposers.reverse())
            dispose(); };
    });
}
//# sourceMappingURL=RoleToolView.js.map