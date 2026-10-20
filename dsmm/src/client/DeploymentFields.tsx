import { useId, useState, useSyncExternalStore } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { DeploymentSchemaNode } from "../profile-types.js";
import type { NativeCommandEntry } from "../permission-settings.js";
import type { PermissionRule } from "../permission-rules.js";
import type { DeploymentController } from "./deployment-controller.js";
import { at, enumValues, equal, mergeLayer, parseAdvanced, validateEditorValue } from "./deployment-data.js";
import { deploymentFieldLabels } from "./deployment-locales.js";
import { permissionEn, permissionZh } from "./permission-locales.js";
import type { PermissionLocaleKey } from "./permission-locales.js";
import { NativeCommandEntries } from "./NativeCommandEntries.js";
import { PermissionRuleEntries } from "./PermissionRuleEntries.js";

type Locale = PropsLocale<"plugins.dsmm">;
export const permissionText = (t: Locale["t"]) => (key: PermissionLocaleKey): string => (t("global") === "DSMM 全局配置" ? permissionZh : permissionEn)[key];
export function fieldLabel(path: readonly string[], t: Locale["t"]): string {
  const key = path.at(-1)!;
  if (path[0] === "permissionControl" && ["outsideReads", "webSearch", "webFetch", "rules", "nativeCommands", "rule"].includes(key)) return permissionText(t)(key as PermissionLocaleKey);
  if (path[0] === "guards") {
    const guard: Partial<Record<string, PermissionLocaleKey>> = { scope: "guardScope", shellCommandSafety: "shellSafety", gitWriteGuard: "gitWrite", toolOutputTruncation: "toolOutputTruncation", planFormatValidation: "planValidation", questionLabelHelper: "questionLabels", todoDisciplineHelper: "todoDiscipline",
      enabled: "enabled", maxInlineBytes: "maxInlineBytes", maxLabelChars: "maxLabelChars" };
    const mapped = guard[key]; if (mapped !== undefined) return permissionText(t)(mapped);
  }
  const item = deploymentFieldLabels[key];
  return item === undefined ? key.replace(/^dsmm-/u, "").replace(/([a-z])([A-Z])/gu, "$1 $2") : item[t("global") === "DSMM 全局配置" ? 1 : 0];
}
export function displayValue(value: unknown, t: Locale["t"]): string {
  if (value === undefined) return t("unknown");
  if (typeof value === "boolean") return t(value ? "on" : "off");
  const text = JSON.stringify(value); return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
export function AdvancedField({ schema, path, controller, inherited, upper, expanded, onExpandedChange, t }: Locale & { schema: DeploymentSchemaNode; path: string[]; controller: DeploymentController; inherited: unknown; upper: unknown; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), id = useId(), name = path.join(".");
  const value = at(state.draft, path), raw = state.raw[name], text = raw?.text ?? (value === undefined ? "" : JSON.stringify(value, null, 2)), invalid = raw?.invalid === true;
  return <details className="dsmm-deployment-group" data-field={name} open={expanded} onToggle={event => onExpandedChange?.(event.currentTarget.open)}><summary id={`${id}-label`}>{fieldLabel(path, t)} · {t("advanced")}</summary><div className="dsmm-field">
    <p className="dsmm-hint" id={`${id}-hint`}>{t("advancedHint")}</p>
    {path[0] === "permissionControl" && <p className="dsmm-hint">{permissionText(t)("configRulesHint")}</p>}
    <p className="dsmm-hint">{t(value === undefined ? "inherit" : "explicit")}</p>
    {upper !== undefined && <p className="dsmm-hint">{t("profileSource")}: {displayValue(upper, t)}</p>}
    <textarea id={id} rows={6} maxLength={32768} value={text} disabled={!controller.canEdit()} aria-labelledby={`${id}-label`} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} onChange={event => {
      const next = event.currentTarget.value; let parsed: unknown, valid = true;
      try { parsed = parseAdvanced(next); const candidate = parsed === undefined ? inherited : mergeLayer(inherited, parsed); valid = parsed === undefined || validateEditorValue(parsed, schema, true) && validateEditorValue(upper === undefined ? candidate : mergeLayer(candidate, upper), schema); } catch { valid = false; }
      controller.setRaw(name, next, !valid); if (valid) controller.edit(path, parsed);
    }} /><p id={`${id}-error`} className="dsmm-hint">{invalid ? t("invalid") : ""}</p>
    <Button type="button" variant="outline" data-dsmm-unset={name} disabled={!controller.canEdit() || value === undefined && raw === undefined} onClick={() => { controller.clearRaw(name); controller.edit(path, undefined); }}>{t("unset")}</Button>
    <details><summary>{t("inherit")}</summary><pre>{JSON.stringify(inherited, null, 2)}</pre></details>
    <details><summary>schema</summary><pre>{JSON.stringify(schema, null, 2)}</pre></details>
  </div></details>;
}
export function ScalarField({ schema, path, controller, inherited, t }: Locale & { schema: DeploymentSchemaNode; path: string[]; controller: DeploymentController; inherited: unknown }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), id = useId(), name = path.join(".");
  const value = at(state.draft, path), raw = state.raw[name], bad = raw?.invalid === true;
  const units = name === "guards.toolOutputTruncation.maxInlineBytes" ? ` · ${permissionText(t)("unitBytes")}` : name === "guards.questionLabelHelper.maxLabelChars" ? ` · ${permissionText(t)("unitChars")}` : "";
  return <><label htmlFor={id}>{fieldLabel(path, t)}</label><div className="dsmm-actions">
    <Input className="dsmm-input" id={id} type="text" inputMode={schema.type === "number" ? "decimal" : undefined} value={raw?.text ?? String(value ?? inherited ?? "")} disabled={!controller.canEdit()} aria-invalid={bad} aria-describedby={`${id}-error`} onChange={event => {
      const text = event.currentTarget.value, candidate = schema.type === "number" ? Number(text) : text;
      const valid = (schema.type !== "number" || text.trim() !== "") && validateEditorValue(candidate, schema);
      controller.setRaw(name, text, !valid); if (valid) controller.edit(path, candidate);
    }} /><Button type="button" variant="outline" data-dsmm-unset={name} disabled={!controller.canEdit() || value === undefined && raw === undefined} onClick={() => { controller.clearRaw(name); controller.edit(path, undefined); }}>{t("unset")}</Button>
  </div><p id={`${id}-error`} className="dsmm-hint">{bad ? t("invalid") : ""}{schema.type === "number" && (schema.min !== undefined || schema.max !== undefined) ? ` ${schema.min ?? "—"} – ${schema.max ?? "—"}` : ""}{units}</p></>;
}
export function Field({ schema, path, controller, initiallyOpen = false, disclosures, t }: Locale & { schema: DeploymentSchemaNode; path: string[]; controller: DeploymentController; initiallyOpen?: boolean; disclosures?: Map<string, boolean> }) {
  if (schema.type === "transform" && schema.inner !== undefined) schema = schema.inner;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), snapshot = state.snapshot!, id = useId(), name = path.join(".");
  const [open, setOpen] = useState(disclosures?.get(name) ?? initiallyOpen);
  const expand = (expanded: boolean) => { disclosures?.set(name, expanded); setOpen(expanded); };
  const explicit = at(state.draft, path), inherited = controller.layer === "global" ? at(snapshot.defaults, path) : at(mergeLayer(mergeLayer(snapshot.defaults, snapshot.global), snapshot.nativeForm?.base ?? {}), path);
  const choices = enumValues(schema), disabled = !controller.canEdit();
  if (name === "permissionControl.nativeCommands.entries") return <div data-field={name}><NativeCommandEntries controller={controller} value={explicit as readonly NativeCommandEntry[] | undefined} inherited={(inherited ?? []) as readonly NativeCommandEntry[]} disabled={disabled} onChange={value => controller.edit(path, value)} setInvalid={(key, bad) => controller.setInvalid(key, bad)} t={permissionText(t)} /></div>;
  if (name === "permissionControl.rules") return <div data-field={name}><PermissionRuleEntries controller={controller} value={explicit as readonly PermissionRule[] | undefined} inherited={(inherited ?? []) as readonly PermissionRule[]} disabled={disabled} onChange={value => controller.edit(path, value)} expanded={open} onExpandedChange={expand} t={permissionText(t)} /></div>;
  if (schema.type === "object" && schema.fields !== undefined && path[0] !== "roleRouting") return <details className="dsmm-deployment-group" data-field={name} open={open} onToggle={event => expand(event.currentTarget.open)}><summary>{fieldLabel(path, t)}</summary><div>
    {name === "permissionControl" && <p className="dsmm-hint">{permissionText(t)("configPolicyHint")}</p>}
    <p className="dsmm-hint">{t(explicit === undefined ? "inherit" : "explicit")}</p>
    <Button type="button" variant="outline" data-dsmm-unset={name} disabled={disabled || explicit === undefined && !Object.keys(state.raw).some(key => key === name || key.startsWith(`${name}.`))} onClick={() => { controller.clearRaw(name); controller.edit(path, undefined); }}>{t("unsetGroup")}</Button>
    {Object.entries(schema.fields).map(([key, node]) => <Field key={key} schema={node} path={[...path, key]} controller={controller} disclosures={disclosures} t={t} />)}
  </div></details>;
  if (!["boolean", "string", "number"].includes(schema.type) && choices === null) return <AdvancedField schema={schema} path={path} controller={controller} inherited={inherited} upper={controller.layer === "global" ? at(snapshot.profile, path) : undefined} expanded={open} onExpandedChange={expand} t={t} />;
  return <div className="dsmm-field dsmm-deployment-field" data-field={name}>
    {schema.type === "boolean" || choices !== null ? <><label htmlFor={id}>{fieldLabel(path, t)}</label><select id={id} disabled={disabled} value={explicit === undefined ? "inherit" : JSON.stringify(explicit)} onChange={event => controller.edit(path, event.currentTarget.value === "inherit" ? undefined : JSON.parse(event.currentTarget.value))}>
      <option value="inherit">{`${t("unset")} · ${displayValue(inherited, t)}`}</option>{(choices ?? [true, false]).map(choice => <option key={String(choice)} value={JSON.stringify(choice)}>{displayValue(choice, t)}</option>)}
    </select></> : <ScalarField schema={schema} path={path} controller={controller} inherited={inherited} t={t} />}
    {name === "modelParameters.passthrough" && <p className="dsmm-hint">{t("modelParametersHint")}</p>}
    {name === "permissionControl.enabled" && <p className="dsmm-hint">{permissionText(t)("coldHint")}</p>}
    {explicit !== undefined && <p className="dsmm-hint">{t(equal(explicit, at(snapshot.defaults, path)) ? "defaultPin" : "explicit")}</p>}
    {controller.layer === "profile" && at(snapshot.nativeForm?.base, path) !== undefined && <p className="dsmm-hint">{t("hostPin")}</p>}
    {controller.layer === "global" && at(snapshot.profile, path) !== undefined && <p className="dsmm-hint">{t("profileSource")}: {displayValue(at(snapshot.profile, path), t)} · {t("explicit")}</p>}
  </div>;
}
