import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ConfigForms } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { DeploymentSchemaNode, SessionProfileSnapshot } from "../profile-types.js";
import { DeploymentController } from "./deployment-controller.js";
import type { NativePageForm } from "./deployment-controller.js";
import type { DsmmConfigRemote } from "../profile-remote.js";
import { at, enumValues, equal, inspectorPaths, mergeLayer, parseAdvanced, validateEditorValue } from "./deployment-data.js";
import { deploymentFieldLabels } from "./deployment-locales.js";

type Locale = PropsLocale<"plugins.dsmm">;
export interface DeploymentPageProps extends Locale {
  view: "summary" | "page";
  form?: NativePageForm;
  core: DeploymentController;
  remote: DsmmConfigRemote;
  forms?: ConfigForms;
  rowNamespace?: string;
  profilePage?: boolean;
}
function label(path: readonly string[], t: Locale["t"]): string {
  const key = path.at(-1)!;
  const item = deploymentFieldLabels[key];
  return item === undefined ? key.replace(/^dsmm-/u, "").replace(/([a-z])([A-Z])/gu, "$1 $2") : item[t("global") === "DSMM 全局配置" ? 1 : 0];
}
function displayValue(value: unknown, t: Locale["t"]): string {
  if (value === undefined) return t("unknown");
  if (typeof value === "boolean") return t(value ? "on" : "off");
  const text = JSON.stringify(value); return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function AdvancedField({ schema, path, value, inherited, reset, disabled, onChange, setInvalid, t }: Locale & {
  schema: DeploymentSchemaNode; path: string[]; value: unknown; disabled: boolean;
  reset: unknown; inherited: unknown;
  onChange(value: unknown): void; setInvalid(path: string, invalid: boolean): void;
}) {
  const id = useId(), name = path.join(".");
  const serialized = value === undefined ? "" : JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialized);
  const [invalid, setLocalInvalid] = useState(false);
  useEffect(() => { setText(serialized); setLocalInvalid(false); setInvalid(name, false); }, [serialized, reset]);
  return <details className="dsmm-deployment-group"><summary>{label(path, t)} · {t("advanced")} <code>{name}</code></summary><div className="dsmm-field">
    <label htmlFor={id}>{label(path, t)} · {t("advanced")} <code>{name}</code></label>
    <p className="dsmm-hint" id={`${id}-hint`}>{t("advancedHint")}</p>
    <textarea id={id} rows={6} maxLength={32768} value={text} disabled={disabled} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} onChange={event => {
      const next = event.currentTarget.value; setText(next);
      let parsed: unknown, valid = true;
      try { parsed = parseAdvanced(next); valid = parsed === undefined || validateEditorValue(parsed, schema, true) && validateEditorValue(mergeLayer(inherited, parsed), schema); } catch { valid = false; }
      setLocalInvalid(!valid); setInvalid(name, !valid); if (valid) onChange(parsed);
    }} />
    <p id={`${id}-error`} className="dsmm-hint">{invalid ? t("invalid") : ""}</p>
    <details><summary>{t("advanced")} · schema</summary><pre>{JSON.stringify(schema, null, 2)}</pre></details>
  </div></details>;
}

function ScalarField({ schema, path, controller, disabled, inherited, invalid, t }: Locale & {
  schema: DeploymentSchemaNode; path: string[]; controller: DeploymentController; disabled: boolean; inherited: unknown;
  invalid(path: string, value: boolean): void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const value = at(state.draft, path), name = path.join("."), id = useId();
  const [text, setText] = useState(String(value ?? inherited ?? ""));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(String(value ?? inherited ?? "")); setBad(false); invalid(name, false); }, [value, inherited, state.snapshot]);
  return <><label htmlFor={id}>{label(path, t)} <code>{name}</code></label><div className="dsmm-actions">
    <Input className="dsmm-input" id={id} type="text" inputMode={schema.type === "number" ? "decimal" : undefined} value={text} disabled={disabled} aria-invalid={bad} aria-describedby={`${id}-error`} onChange={event => {
      const raw = event.currentTarget.value; setText(raw);
      const candidate = schema.type === "number" ? Number(raw) : raw;
      const valid = (schema.type !== "number" || raw.trim() !== "") && validateEditorValue(candidate, schema);
      setBad(!valid); invalid(name, !valid); if (valid) controller.edit(path, candidate);
    }} /><Button type="button" variant="outline" disabled={disabled || value === undefined && !bad} onClick={() => { setText(String(inherited ?? "")); setBad(false); invalid(name, false); controller.edit(path, undefined); }}>{t("inherit")}</Button>
  </div><p id={`${id}-error`} className="dsmm-hint">{bad ? t("invalid") : ""}{schema.type === "number" && (schema.min !== undefined || schema.max !== undefined) ? ` ${schema.min ?? "—"} – ${schema.max ?? "—"}` : ""}</p></>;
}

function Field({ schema, path, controller, invalid, t }: Locale & {
  schema: DeploymentSchemaNode; path: string[]; controller: DeploymentController; invalid(path: string, value: boolean): void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), snapshot = state.snapshot!;
  const id = useId(), name = path.join("."), explicit = at(state.draft, path);
  const inherited = controller.layer === "global" ? at(snapshot.defaults, path) : at(mergeLayer(mergeLayer(snapshot.defaults, snapshot.global), snapshot.nativeForm?.base ?? {}), path);
  const disabled = state.busy || state.issue === "not-owned" || state.issue === "unavailable" || state.issue === "transport" || controller.layer === "profile" && !controller.canWriteProfile();
  const choices = enumValues(schema);
  if (schema.type === "object" && schema.fields !== undefined && path[0] !== "roleRouting" && path[0] !== "lsp") return <details className="dsmm-deployment-group">
    <summary>{label(path, t)} <code>{name}</code></summary>
    <div>{Object.entries(schema.fields).map(([key, node]) => <Field key={key} schema={node} path={[...path, key]} controller={controller} invalid={invalid} t={t} />)}</div>
  </details>;
  if (!["boolean", "string", "number"].includes(schema.type) && choices === null) return <AdvancedField schema={schema} path={path} value={explicit} inherited={inherited} reset={snapshot} disabled={disabled} t={t} onChange={value => controller.edit(path, value)} setInvalid={invalid} />;
  return <div className="dsmm-field dsmm-deployment-field">
    {schema.type === "boolean" || choices !== null ? <><label htmlFor={id}>{label(path, t)} <code>{name}</code></label><select id={id} disabled={disabled} value={explicit === undefined ? "inherit" : JSON.stringify(explicit)} onChange={event => controller.edit(path, event.currentTarget.value === "inherit" ? undefined : JSON.parse(event.currentTarget.value))}>
      <option value="inherit">{t("inherit")} · {displayValue(inherited, t)}</option>
      {(choices ?? [true, false]).map(choice => <option key={String(choice)} value={JSON.stringify(choice)}>{displayValue(choice, t)}</option>)}
    </select></> : <ScalarField schema={schema} path={path} controller={controller} disabled={disabled} inherited={inherited} invalid={invalid} t={t} />}
    {(explicit !== undefined || controller.layer === "profile" && at(snapshot.nativeForm?.base, path) !== undefined) && <p className="dsmm-hint">{explicit === undefined ? "" : equal(explicit, at(snapshot.defaults, path)) ? t("defaultPin") : t("explicit")}
      {controller.layer === "profile" && at(snapshot.nativeForm?.base, path) !== undefined ? `${explicit === undefined ? "" : " · "}${t("hostPin")}` : ""}</p>}
  </div>;
}

function Layer({ controller, t }: Locale & { controller: DeploymentController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const updateInvalid = (path: string, bad: boolean) => { controller.setInvalid(path, bad); setInvalid(previous => { if (previous.has(path) === bad) return previous; const next = new Set(previous); if (bad) next.add(path); else next.delete(path); return next; }); };
  const title = controller.layer === "global" ? "global" : "profile";
  const disabled = state.busy || state.snapshot === null || state.issue !== null || invalid.size > 0 || controller.layer === "profile" && !controller.canWriteProfile();
  return <div data-dsmm-layer={controller.layer} aria-busy={state.busy}>
    <details className="dsmm-deployment-card"><summary>{t(title)}<span role="status" aria-live="polite" className="dsmm-hint">{state.busy ? t("saving") : state.dirty ? t("dirty") : state.saved ? t("saved") : ""}</span></summary>
    <fieldset><legend>{t(title)}</legend><p className="dsmm-hint">{t(title === "global" ? "globalHint" : "profileHint")}</p>
    {state.snapshot !== null && Object.entries(state.snapshot.schema.fields ?? {}).filter(([key]) => controller.layer === "global" || key !== "modules").sort(([a], [b]) => a === "modules" ? -1 : b === "modules" ? 1 : 0).map(([key, schema]) => <Field key={key} schema={schema} path={[key]} controller={controller} invalid={updateInvalid} t={t} />)}
    <div className="dsmm-actions"><Button type="button" variant="primary" disabled={disabled || !state.dirty} onClick={() => { void controller.save(); }}>{t(state.busy ? "saving" : title === "global" ? "saveGlobal" : "saveProfile")}</Button>
      <Button type="button" variant="outline" disabled={state.busy} onClick={() => { void controller.refresh(); }}>{t("refresh")}</Button>
      <Button type="button" variant="outline" disabled={state.busy || !state.dirty && state.issue === null} onClick={() => { setInvalid(new Set()); void controller.refresh(true); }}>{t("discard")}</Button></div>
    </fieldset></details>
    {state.issue !== null && <p className="dsmm-issue" role="alert">{t(state.issue)}</p>}
    {invalid.size > 0 && <p className="dsmm-issue" role="alert">{t("invalid")}</p>}
    {controller.layer === "profile" && !controller.canWriteProfile() && <p className="dsmm-hint">{t("unavailableForm")}</p>}
  </div>;
}

function NativeProfileLayer({ namespace, forms, remote, form, core, t }: Locale & { namespace: string; forms: ConfigForms; remote: DsmmConfigRemote; form?: NativePageForm; core: DeploymentController }) {
  const shared = useMemo(() => forms.get<Record<string, unknown>>(namespace), [forms, namespace]);
  const snapshot = useSyncExternalStore(listener => shared.subscribe(listener), () => shared.getSnapshot());
  const controller = useMemo(() => core.forProfile(namespace), [core, remote, namespace]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const coreState = useSyncExternalStore(core.subscribe, core.getSnapshot);
  controller.attachForm(form ?? { state: snapshot, mutate: (ops, revision) => shared.mutate(ops, revision) });
  useEffect(() => { void controller.refresh(); return () => controller.dispose(); }, [controller]);
  useEffect(() => { if (state.saved) void core.refresh(); }, [state.saved, core]);
  useEffect(() => { if (controller.getSnapshot().snapshot !== null) void controller.refresh(); }, [coreState.snapshot?.globalRevision, snapshot.revision, controller]);
  return <Layer controller={controller} t={t} />;
}

function StateInspector({ controller, session, t }: Locale & { controller: DeploymentController; session: SessionProfileSnapshot | null }) {
  const { snapshot, dirty, issue } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  if (snapshot === null) return null;
  const admitted = session?.configuration ?? null;
  const source = (value: string | undefined): string => t(value === "profile" ? "profileSource" : value === "global" ? "globalSource" : value === "defaults" ? "defaultsSource" : value === "named-session" ? "namedSource" : value === "startup" ? "startupSource" : value === "deployment" ? "deploymentCapture" : value === "mixed" ? "mixedSource" : "unknown");
  const value = (layer: Record<string, unknown> | undefined, path: string): string => layer === undefined ? t("unknown") : at(layer, path.split(".")) === undefined ? t("absent") : displayValue(at(layer, path.split(".")), t);
  const metadata = (layer: Record<string, unknown> | undefined, path: string, entry: string | undefined): string => layer !== undefined && at(layer, path.split(".")) === undefined && entry === undefined ? t("absent") : source(entry);
  return <details className="dsmm-deployment-card"><summary>{t("state")}<span className="dsmm-hint">{(snapshot.nextRoot?.restartRequired.length ?? 0) > 0 ? t("pending") : dirty || issue !== null ? t("inspectorStale") : ""}</span></summary><div>
    <p role="status" aria-live="polite">{session === null ? t("noSession") : admitted === null ? t("sessionUnavailable") : `${t("namedSource")}: ${admitted.named?.id ?? "—"}`}</p>
    {session !== null && <p>{t("session")}: <code>{session.sessionId}</code> · <code>{session.admissionEpoch}</code> · {session.scope}</p>}
    {(dirty || issue !== null) && <p className="dsmm-hint">{t("inspectorStale")}</p>}
    <p className="dsmm-hint">Global CAS: <code>{snapshot.globalRevision}</code> · native CAS: <code>{snapshot.nativeRevision}</code> · Host form: {snapshot.nativeFormRevision ?? "—"}</p>
    {inspectorPaths(snapshot, admitted).map(path => <dl key={path} className="dsmm-deployment-state"><dt><code>{path}</code></dt>
      <dd>{t("globalSource")}: {at(snapshot.global, path.split(".")) === undefined ? t("absent") : t("globalSource")}</dd>
      <dd>{t("desired")}: {value(snapshot.desired, path)} · {metadata(snapshot.desired, path, snapshot.sources[path])}</dd>
      <dd>{t("startup")}: {value(snapshot.startup, path)} · {metadata(snapshot.startup, path, snapshot.startupSources?.[path])} / {at(snapshot.startup, path.split(".")) === undefined ? t("absent") : t("startupSource")}</dd>
      <dd>{t("next")}: {value(snapshot.nextRoot?.settings, path)} · {metadata(snapshot.nextRoot?.settings, path, snapshot.nextRoot?.sources[path])} / {metadata(snapshot.nextRoot?.settings, path, snapshot.nextRoot?.captures[path])}</dd>
      <dd>{t("session")}: {value(admitted?.settings, path)} · {metadata(admitted?.settings, path, admitted?.sources[path])} / {metadata(admitted?.settings, path, admitted?.captures[path])}</dd>
    </dl>)}
    {(snapshot.nextRoot?.restartRequired.length ?? 0) > 0 && <p>{t("pending")}: {snapshot.nextRoot!.restartRequired.join(", ")}</p>}
  </div></details>;
}

export function DeploymentPage(props: DeploymentPageProps) {
  const state = useSyncExternalStore(props.core.subscribe, props.core.getSnapshot);
  useEffect(() => { if (props.view === "page") void props.core.refresh(); }, [props.core, props.view]);
  if (props.view === "summary") return <span>{props.t("summary")}</span>;
  const { t } = props, snapshot = state.snapshot, module = snapshot?.modules[0];
  return <section className="dsmm-profiles dsmm-deployment" data-dsmm-page aria-label={t("title")}>
    <p className="dsmm-hint">{t("description")}</p><p className="dsmm-hint">{t("boundaries")}</p>
    <details className="dsmm-deployment-card"><summary>{t("module")}<span className="dsmm-hint">{module?.pending ? t("pending") : module === undefined ? t("unknown") : t(module.desired.enabled ? "on" : "off")}</span></summary><div><p>{t("hostUnknown")}</p><p>{t("desired")}: {module === undefined ? t("unknown") : t(module.desired.enabled ? "on" : "off")} · {module?.desired.source ?? "—"}</p>
      <p>{t("startup")}: {module === undefined ? t("unknown") : t(module.startupMounted ? "on" : "off")} · {t("next")}: {module === undefined ? t("unknown") : t(module.nextRoot.admitted ? "on" : "off")}</p>
      <p>{t("session")}: {state.session?.modules?.[0]?.admitted == null ? t("unknown") : t(state.session.modules[0].admitted ? "on" : "off")}</p>
      <p className="dsmm-hint">{t("ceiling")}</p></div></details>
    <Layer controller={props.core} t={t} />
    {props.profilePage && props.forms !== undefined && snapshot?.namespace !== null && snapshot?.namespace !== undefined && (props.rowNamespace === undefined || props.rowNamespace === snapshot.namespace)
      ? <NativeProfileLayer key={`${snapshot.hostProfileKey}:${snapshot.entryId}`} namespace={snapshot.namespace} forms={props.forms} remote={props.remote} form={props.form} core={props.core} t={t} />
      : <div><details className="dsmm-deployment-card"><summary>{t("profile")}<span className="dsmm-hint">{t("profileUnavailable")}</span></summary><div><p>{t("profileHint")}</p></div></details><p className="dsmm-hint">{t("unavailableForm")}</p></div>}
    <StateInspector controller={props.core} session={state.session} t={t} />
  </section>;
}
