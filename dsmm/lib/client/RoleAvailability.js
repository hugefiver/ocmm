import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { parseRoleAvailability } from "../profile-remote.js";
export function roleAvailability(value) {
    if (value === undefined)
        return undefined;
    try {
        return parseRoleAvailability(value);
    }
    catch {
        return undefined;
    }
}
export function RoleAvailability({ value, t }) {
    const state = roleAvailability(value);
    if (state === undefined)
        return _jsx("p", { className: "dsmm-hint", children: t("availabilityUnknown") });
    return _jsxs("div", { className: "dsmm-availability", "data-dsmm-role-availability": state.id, children: [_jsx("p", { children: t(state.required ? "roleRequired" : "roleOptional", { reason: state.requiredReason ?? "—" }) }), state.reason !== undefined && _jsx("p", { children: t("roleUnavailableReason", { reason: state.reason }) }), _jsxs("details", { children: [_jsx("summary", { children: t("technicalDetails") }), _jsx("p", { children: t("roleCeiling", { startup: t(state.startupAvailable ? "enabled" : "disabled"), deployment: t(state.deploymentEnabled ? "enabled" : "disabled"), admitted: t(state.admitted ? "enabled" : "disabled") }) }), _jsx("p", { className: "dsmm-hint", children: t("roleProvenance", { source: state.source, capture: state.capture }) })] })] });
}
//# sourceMappingURL=RoleAvailability.js.map