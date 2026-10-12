import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { findNodeAtLocation } from "jsonc-parser";
import { diagnostic, fieldLocation, inspectJsonDocument } from "../profile-diagnostics.js";
import { parseProfileDiagnostic, parseProfileErrorInfo } from "../profile-remote.js";
/** Wire grammar is checked again at presentation; raw exception text is never retained. */
export function safeIssue(info) {
    try {
        const parsed = parseProfileErrorInfo(info);
        return { kind: "domain", code: parsed.code, ...(parsed.field === undefined ? {} : { field: parsed.field }),
            ...(parsed.reason === undefined ? {} : { reason: parsed.reason }), ...(parsed.location === undefined ? {} : { location: parsed.location }) };
    }
    catch {
        return { kind: "assembly", code: "unavailable" };
    }
}
export function profileWarnings(warnings) {
    return (warnings ?? []).flatMap(value => {
        try {
            const warning = parseProfileDiagnostic(value);
            return warning.severity === "warning" && warning.code === "blank-label" && warning.field === "label" ? [warning] : [];
        }
        catch {
            return [];
        }
    });
}
export function draftWarnings(content) {
    const { tree, diagnostics } = inspectJsonDocument(content);
    if (tree?.type !== "object" || diagnostics.length !== 0)
        return [];
    const node = findNodeAtLocation(tree, ["label"]);
    if (node?.type !== "string")
        return [];
    const label = node.value;
    if (label.length > 120 || /[\u0000-\u001f\u007f]/u.test(label) || label.trim() !== ""
        || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(label)) !== label)
        return [];
    return [diagnostic("blank-label", "label", fieldLocation(content, tree, "label"))];
}
export function ProfileWarnings({ warnings, t }) {
    return _jsx(_Fragment, { children: profileWarnings(warnings).map(warning => _jsxs("div", { className: "dsmm-warning", "data-dsmm-warning": true, children: [_jsx("p", { children: t("warningMarker", { code: warning.code, field: warning.field }) }), _jsxs("details", { children: [_jsx("summary", { children: t("details") }), _jsx("p", { children: t("blankLabelWarning") })] })] }, `${warning.code}:${warning.field}`)) });
}
export function IssueDetails({ issue, t }) {
    const safe = safeIssue({ code: issue.code, message: "", ...(issue.field === undefined ? {} : { field: issue.field }),
        ...(issue.reason === undefined ? {} : { reason: issue.reason }), ...(issue.location === undefined ? {} : { location: issue.location }) });
    return _jsxs("div", { className: "dsmm-diagnostic", children: [_jsx("p", { children: t("blockingMarker", { code: safe.reason ?? safe.code, field: safe.field ?? "document" }) }), safe.location !== undefined && _jsx("p", { children: t("diagnosticLocation", { line: safe.location.line, column: safe.location.column }) }), safe.reason !== undefined && _jsxs("details", { children: [_jsx("summary", { children: t("details") }), _jsx("p", { children: t(DIAGNOSTIC_LABELS[safe.reason]) })] })] });
}
const DIAGNOSTIC_LABELS = {
    "invalid-jsonc": "diagnosticJsonc", "duplicate-field": "diagnosticDuplicate", "unsafe-field": "diagnosticUnsafe", "unknown-field": "diagnosticUnknown",
    "deprecated-field": "diagnosticDeprecated", "invalid-type": "diagnosticType", "unsupported-value": "diagnosticValue", "invalid-route": "diagnosticRoute",
    "required-role": "diagnosticRequired", "deployment-ceiling": "diagnosticCeiling", "blank-label": "blankLabelWarning",
};
//# sourceMappingURL=diagnostics.js.map