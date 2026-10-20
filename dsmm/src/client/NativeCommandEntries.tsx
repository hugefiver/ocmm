import { useId, useSyncExternalStore } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { parseNativeCommandPattern, parseNativeCommands } from "../permission-settings.js";
import type { NativeCommandEntry } from "../permission-settings.js";
import type { PermissionLocaleKey } from "./permission-locales.js";
import type { DeploymentController } from "./deployment-controller.js";

type Text = (key: PermissionLocaleKey) => string;
const ENTRIES_PATH = "permissionControl.nativeCommands.entries";
export function validNativeEntries(entries: readonly NativeCommandEntry[]): boolean {
  try { parseNativeCommands({ entries }); return true; } catch { return false; }
}
export function emptyNativeEntry(): NativeCommandEntry {
  return { id: "", mode: "ask", sandboxMode: "workspace-write", match: { tool: "bash", workingDirectory: "", commandPattern: "" } };
}
function patternValid(value: string): boolean {
  try { parseNativeCommandPattern(value); return true; } catch { return false; }
}
function TextField({ id, label, value, disabled, onChange }: {
  id: string; label: string; value: string; disabled: boolean; onChange(value: string): void;
}) {
  return <div className="dsmm-field"><label htmlFor={id}>{label}</label>
    <Input className="dsmm-input" id={id} value={value} maxLength={32768} disabled={disabled} required onChange={event => onChange(event.currentTarget.value)} /></div>;
}
function Pattern({ value, controller, name, disabled, onChange, t }: {
  value: string; controller: DeploymentController; name: string; disabled: boolean; onChange(value: string): void; t: Text;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), id = useId(), raw = state.raw[name], text = raw?.text ?? value, bad = raw?.invalid === true;
  return <div className="dsmm-field"><label htmlFor={`${id}-pattern`}>{t("pattern")}</label>
    <Input className="dsmm-input" id={`${id}-pattern`} value={text} maxLength={32768} disabled={disabled} required aria-invalid={bad} aria-describedby={bad ? `${id}-error` : undefined} spellCheck={false} autoComplete="off" onChange={event => {
      const next = event.currentTarget.value, valid = patternValid(next);
      controller.setRaw(name, next, !valid); if (valid) onChange(next);
    }} />{bad && <p id={`${id}-error`} className="dsmm-hint">{t("invalidPattern")}</p>}</div>;
}
function Entry({ entry, index, controller, disabled, change, remove, t }: {
  entry: NativeCommandEntry; index: number; controller: DeploymentController; disabled: boolean; change(value: NativeCommandEntry): void; remove(): void; t: Text;
}) {
  const id = useId(), match = entry.match, row = `${ENTRIES_PATH}.${index}`;
  const valid = validNativeEntries([entry]);
  return <fieldset aria-describedby={!valid ? `${id}-error` : undefined}><legend>{t("nativeCommands")} {index + 1}</legend>
    {!valid && <p className="dsmm-hint" id={`${id}-error`}>{t("invalidEntry")}</p>}
    <TextField id={`${id}-id`} label={t("entryId")} value={entry.id} disabled={disabled} onChange={value => change({ ...entry, id: value })} />
    <div className="dsmm-field"><label htmlFor={`${id}-tool`}>{t("tool")}</label><select id={`${id}-tool`} disabled={disabled} value={match.tool} onChange={event => {
      const tool = event.currentTarget.value; if (tool === "bash" || tool === "pwsh") change({ ...entry, match: { ...match, tool } });
    }}>{["bash", "pwsh"].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    <Pattern value={match.commandPattern} controller={controller} name={`${row}.commandPattern`} disabled={disabled} t={t}
      onChange={commandPattern => change({ ...entry, match: { ...match, commandPattern } })} />
    <TextField id={`${id}-workingDirectory`} label={t("cwd")} value={match.workingDirectory} disabled={disabled} onChange={workingDirectory => change({ ...entry, match: { ...match, workingDirectory } })} />
    <div className="dsmm-field"><label htmlFor={`${id}-sandbox`}>{t("sandboxMode")}</label><select id={`${id}-sandbox`} disabled={disabled} value={entry.sandboxMode} onChange={event => {
      if (event.currentTarget.value === "workspace-write") change({ ...entry, sandboxMode: "workspace-write" });
    }}><option value="workspace-write">workspace-write</option>{entry.sandboxMode === "danger-full-access" && <option value="danger-full-access" disabled>{t("restrictedFullAccess")}</option>}</select></div>
    <div className="dsmm-field"><label htmlFor={`${id}-mode`}>{t("mode")}</label><select id={`${id}-mode`} disabled={disabled} value={entry.mode} onChange={event => {
      const mode = event.currentTarget.value; if (mode === "ask" || mode === "allow") change({ ...entry, mode });
    }}><option value="ask">{t("action:ask")}</option><option value="allow">{t("action:allow")}</option></select></div>
    <Button type="button" variant="outline" disabled={disabled} onClick={remove}>{t("removeEntry")} {index + 1}</Button>
  </fieldset>;
}
export function NativeCommandEntries({ value, inherited, controller, disabled, onChange, setInvalid, t }: {
  value: readonly NativeCommandEntry[] | undefined; inherited: readonly NativeCommandEntry[]; controller: DeploymentController; disabled: boolean;
  onChange(value: readonly NativeCommandEntry[] | undefined): void; setInvalid(path: string, bad: boolean): void; t: Text;
}) {
  const entries = value ?? inherited, name = ENTRIES_PATH;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const invalidRows = state.invalidFields.filter(path => path.startsWith(`${name}.`) && path.endsWith(".commandPattern"));
  const valid = validNativeEntries(entries);
  const change = (next: readonly NativeCommandEntry[] | undefined) => { setInvalid(name, !validNativeEntries(next ?? inherited)); onChange(next); };
  const remove = (index: number) => {
    const drafts = Object.entries(state.raw).flatMap(([path, draft]) => {
      if (!path.startsWith(`${name}.`)) return [];
      const [row, ...field] = path.slice(name.length + 1).split(".");
      const position = Number(row);
      if (!Number.isInteger(position) || field.length === 0 || position === index) return [];
      return [{ path: `${name}.${position > index ? position - 1 : position}.${field.join(".")}`, draft }];
    });
    controller.clearRaw(name);
    for (const draft of drafts) controller.setRaw(draft.path, draft.draft.text, draft.draft.invalid);
    change(entries.filter((_, position) => position !== index));
  };
  return <details className="dsmm-deployment-group"><summary>{t("nativeCommands")} <code>{name}</code></summary><div className="dsmm-structured">
    <p className="dsmm-hint">{t("nativeCommandsHint")}</p><p className="dsmm-hint">{t("patternHint")}</p><p className="dsmm-hint">{t("patternScope")}</p><p className="dsmm-hint">{t("registrationUnresolved")}</p>
    <p className="dsmm-hint">{t(value === undefined ? "inheritedEntries" : "explicitEntries")}</p>
    {!valid && <p className="dsmm-issue" role="alert">{t("invalidEntry")}</p>}
    {invalidRows.length > 0 && <p className="dsmm-hint">{t("invalidPatternHint")}</p>}
    {entries.length === 0 && <p>{t("noEntries")}</p>}
    {entries.map((entry, index) => <Entry key={index} entry={entry} index={index} controller={controller} disabled={disabled} t={t}
      change={next => change(entries.map((row, position) => position === index ? next : row))} remove={() => remove(index)} />)}
    <div className="dsmm-actions"><Button type="button" variant="outline" disabled={disabled || entries.length >= 1024} onClick={() => change([...entries, emptyNativeEntry()])}>{t("addEntry")}</Button>
      <Button type="button" variant="outline" data-dsmm-unset={name} disabled={disabled || value === undefined && invalidRows.length === 0} onClick={() => { controller.clearRaw(name); change(undefined); }}>{t("unset")}</Button></div>
  </div></details>;
}
