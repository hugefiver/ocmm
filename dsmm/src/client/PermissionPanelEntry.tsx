import { useSyncExternalStore } from "react";
import type { HostObservable, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { TemporaryPermissionRemote } from "../permission-temporary-types.js";
import type { PermissionController } from "./permission-controller.js";
import { PermissionsPanel } from "./PermissionsPanel.js";

const absent = { getSnapshot: (): TemporaryPermissionRemote | undefined => undefined, subscribe: () => () => {} };
export function PermissionPanelEntry({ controller, temporary, t }: PropsLocale<"settings.dsmm-permissions"> & {
  controller: PermissionController; temporary?: HostObservable<TemporaryPermissionRemote | undefined>;
}) {
  const scope = useSyncExternalStore(controller.store.subscribe, controller.store.getSnapshot);
  const source = temporary ?? absent;
  const remote = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return <PermissionsPanel controller={controller} sessionId={scope.sessionId ?? undefined} temporary={remote} t={t} />;
}
