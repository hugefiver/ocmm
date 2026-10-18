import { useId, useSyncExternalStore } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { parseNativeCommands } from "../permission-settings.js";
import type { NativeCommandEntry } from "../permission-settings.js";
import { parseAdvanced } from "./deployment-data.js";
import type { PermissionLocaleKey } from "./permission-locales.js";
import type { DeploymentController } from "./deployment-controller.js";

type Text = (key: PermissionLocaleKey) => string;
export function validNativeEntries(entries: readonly NativeCommandEntry[]): boolean {
  try { parseNativeCommands({ entries }); return true; } catch { return false; }
}
export function emptyNativeEntry(): NativeCommandEntry {
  return { id: "", mode: "ask", sandboxMode: "workspace-write", match: { tool: "bash", executable: "", args: [], workingDirectory: "" } };
}
function Arguments({ value, controller, name, disabled, onChange, t }: {
  value: readonly string[]; controller: DeploymentController; name: string; disabled: boolean; onChange(value: readonly string[]): void; t: Text;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), id = useId(), raw = state.raw[name], text = raw?.text ?? JSON.stringify(value), bad = raw?.invalid === true;
  return <div className="dsmm-field"><label htmlFor={id}>{t("args")}</label>
    <textarea id={id} rows={3} maxLength={32768} disabled={disabled} value={text} aria-invalid={bad} aria-describedby={`${id}-error`} onChange={event => {
      const raw = event.currentTarget.value;
      let parsed: unknown;
      try { parsed = parseAdvanced(raw); } catch { /* Keep invalid text local until corrected. */ }
      const valid = Array.isArray(parsed) && parsed.every(item => typeof item === "string" && item.trim() !== "" && !item.includes("\0") && item.length <= 32768);
      controller.setRaw(name, raw, !valid); if (valid) onChange(parsed as string[]);
    }} /><p id={`${id}-error`} className="dsmm-hint">{bad ? t("invalidEntry") : ""}</p></div>;
}
function Entry({ entry, index, controller, disabled, removeDisabled, change, remove, t }: {
  entry: NativeCommandEntry; index: number; controller: DeploymentController; disabled: boolean; removeDisabled: boolean; change(value: NativeCommandEntry): void; remove(): void; t: Text;
}) {
  const id = useId();
  const valid = validNativeEntries([entry]);
  const text = (key: "id" | "executable" | "subcommand" | "workingDirectory", label: PermissionLocaleKey) => <div className="dsmm-field"><label htmlFor={`${id}-${key}`}>{t(label)}</label>
    <Input className="dsmm-input" id={`${id}-${key}`} value={key === "id" ? entry.id : entry.match[key] ?? ""} maxLength={32768} disabled={disabled} required={key !== "subcommand"} onChange={event => {
      const value = event.currentTarget.value;
      if (key === "id") change({ ...entry, id: value });
      else if (key === "subcommand" && value === "") { const { subcommand: _omitted, ...match } = entry.match; change({ ...entry, match }); }
      else change({ ...entry, match: { ...entry.match, [key]: value } });
    }} /></div>;
  return <fieldset aria-describedby={!valid ? `${id}-error` : undefined}><legend>{t("nativeCommands")} {index + 1}</legend>
    {!valid && <p className="dsmm-hint" id={`${id}-error`}>{t("invalidEntry")}</p>}{text("id", "entryId")}
    <div className="dsmm-field"><label htmlFor={`${id}-tool`}>{t("tool")}</label><select id={`${id}-tool`} disabled={disabled} value={entry.match.tool} onChange={event => {
      const tool = event.currentTarget.value; if (tool === "bash" || tool === "pwsh") change({ ...entry, match: { ...entry.match, tool } });
    }}>{["bash", "pwsh"].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    {text("executable", "nativeExecutable")}{text("subcommand", "subcommand")}
    <Arguments value={entry.match.args} controller={controller} name={`permissionControl.nativeCommands.entries.${index}.args`} disabled={disabled} t={t} onChange={args => change({ ...entry, match: { ...entry.match, args } })} />
    {text("workingDirectory", "cwd")}
    <div className="dsmm-field"><label htmlFor={`${id}-sandbox`}>{t("sandboxMode")}</label><select id={`${id}-sandbox`} disabled={disabled} value={entry.sandboxMode} onChange={event => {
      if (event.currentTarget.value === "workspace-write") change({ ...entry, sandboxMode: "workspace-write" });
    }}><option value="workspace-write">workspace-write</option>{entry.sandboxMode === "danger-full-access" && <option value="danger-full-access" disabled>danger-full-access ({t("source")})</option>}</select></div>
    <div className="dsmm-field"><label htmlFor={`${id}-mode`}>{t("mode")}</label><select id={`${id}-mode`} disabled={disabled} value={entry.mode} onChange={event => {
      const mode = event.currentTarget.value; if (mode === "ask" || mode === "allow") change({ ...entry, mode });
    }}><option value="ask">{t("action:ask")}</option><option value="allow">{t("action:allow")}</option></select></div>
    <Button type="button" variant="outline" disabled={disabled || removeDisabled} onClick={remove}>{t("removeEntry")} {index + 1}</Button>
  </fieldset>;
}
export function NativeCommandEntries({ value, inherited, controller, disabled, onChange, setInvalid, t }: {
  value: readonly NativeCommandEntry[] | undefined; inherited: readonly NativeCommandEntry[]; controller: DeploymentController; disabled: boolean;
  onChange(value: readonly NativeCommandEntry[] | undefined): void; setInvalid(path: string, bad: boolean): void; t: Text;
}) {
  const entries = value ?? inherited, name = "permissionControl.nativeCommands.entries";
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const invalidArgs = state.invalidFields.filter(path => path.startsWith(`${name}.`) && path.endsWith(".args"));
  const valid = validNativeEntries(entries);
  const change = (next: readonly NativeCommandEntry[] | undefined) => { setInvalid(name, !validNativeEntries(next ?? inherited)); onChange(next); };
  return <details className="dsmm-deployment-group"><summary>{t("nativeCommands")} <code>{name}</code></summary><div className="dsmm-structured">
    <p className="dsmm-hint">{t("nativeCommandsHint")}</p><p className="dsmm-hint">{t("registrationUnresolved")}</p>
    <p className="dsmm-hint">{t(value === undefined ? "inheritedEntries" : "explicitEntries")}</p>
    {!valid && <p className="dsmm-issue" role="alert">{t("invalidEntry")}</p>}
    {invalidArgs.length > 0 && <p className="dsmm-hint">{t("invalidArgsHint")}</p>}
    {entries.length === 0 && <p>{t("noEntries")}</p>}
    {entries.map((entry, index) => <Entry key={index} entry={entry} index={index} controller={controller} disabled={disabled} removeDisabled={invalidArgs.length > 0} t={t}
      change={next => change(entries.map((row, position) => position === index ? next : row))} remove={() => { controller.clearRaw(name); change(entries.filter((_, position) => position !== index)); }} />)}
    <div className="dsmm-actions"><Button type="button" variant="outline" disabled={disabled || entries.length >= 1024} onClick={() => change([...entries, emptyNativeEntry()])}>{t("addEntry")}</Button>
      <Button type="button" variant="outline" data-dsmm-unset={name} disabled={disabled || value === undefined && invalidArgs.length === 0} onClick={() => { controller.clearRaw(name); change(undefined); }}>{t("unset")}</Button></div>
  </div></details>;
}
