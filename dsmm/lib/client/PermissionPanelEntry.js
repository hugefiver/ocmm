import { jsx as _jsx } from "react/jsx-runtime";
import { useSyncExternalStore } from "react";
import { PermissionsPanel } from "./PermissionsPanel.js";
const absent = { getSnapshot: () => undefined, subscribe: () => () => { } };
export function PermissionPanelEntry({ controller, temporary, t }) {
    const scope = useSyncExternalStore(controller.store.subscribe, controller.store.getSnapshot);
    const source = temporary ?? absent;
    const remote = useSyncExternalStore(source.subscribe, source.getSnapshot);
    return _jsx(PermissionsPanel, { controller: controller, sessionId: scope.sessionId ?? undefined, temporary: remote, t: t });
}
//# sourceMappingURL=PermissionPanelEntry.js.map