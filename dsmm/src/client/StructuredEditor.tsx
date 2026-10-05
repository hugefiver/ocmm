import { useEffect, useId, useState } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ModelCatalog } from "@deepseek-ai/dsh-api-session-controller";
import type { DsmmModelRoute } from "../settings.js";
import type { DsmmRateLimitPolicy, DsmmRuntimePolicyConfig, DsmmRuntimePolicySettings } from "../routing-policy.js";
import { DSMM_RATE_LIMIT_BOUNDS, normalizeRateLimitPolicy } from "../routing-policy.js";
import type { ProfilesActions, ProfilesViewSnapshot } from "./controller.js";
import { structuredDocument } from "./structured.js";
import type { JsonPath } from "./structured.js";
import { RETRY_FIELD_LABEL_KEYS } from "./locales.js";

type Locale = PropsLocale<"settings.dsmm-profiles">;
type Edit = ProfilesActions["editPath"];
const MANUAL = "__dsmm_manual__";

function RetryNumber({ id, name, field, value, inherited, path, disabled, actions, t }: Locale & {
  id: string; name: string; field: keyof DsmmRateLimitPolicy; value: number | undefined; inherited: number | undefined; path: JsonPath; disabled: boolean; actions: ProfilesActions;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [invalid, setInvalid] = useState(false);
  const [min, max] = DSMM_RATE_LIMIT_BOUNDS[field];
  const key = path.join(".");
  useEffect(() => { setDraft(value === undefined ? "" : String(value)); setInvalid(false); }, [value]);
  useEffect(() => { actions.setFieldInvalid(key, invalid); return () => actions.setFieldInvalid(key, false); }, [actions.setFieldInvalid, key, invalid]);
  return <div className="dsmm-field"><label htmlFor={id}>{t("retryField", { name, field: t(RETRY_FIELD_LABEL_KEYS[field]) })}</label>
    <Input id={id} data-dsmm-policy-field={field} className="dsmm-input" type="number" inputMode="numeric" min={min} max={max} step={1} disabled={disabled} value={draft} placeholder={inherited === undefined ? t("unknownDefault") : t("inheritNumber", { value: inherited })}
      aria-invalid={invalid || undefined} aria-describedby={`${id}-hint${invalid ? ` ${id}-invalid` : ""}`} onChange={(event) => {
        const input = event.currentTarget;
        setDraft(input.value);
        const valid = input.validity.valid && (input.value === "" || Number.isSafeInteger(input.valueAsNumber));
        setInvalid(!valid);
        actions.setFieldInvalid(key, !valid);
        if (valid) actions.editPath(path, input.value === "" ? undefined : input.valueAsNumber);
      }} />
    <p className="dsmm-hint" id={`${id}-hint`}>{t("retryBounds", { min, max, value: inherited ?? t("unknownDefault") })}</p>
    {invalid && <p id={`${id}-invalid`}>{t("invalidNumber")}</p>}
  </div>;
}

function RouteFields({ value, path, name, catalog, disabled, edit, editRoute, t }: Locale & {
  value: DsmmModelRoute; path: JsonPath; name: string; catalog: ModelCatalog | null; disabled: boolean; edit: Edit; editRoute: ProfilesActions["editRoute"];
}) {
  const prefix = useId();
  const providers = catalog?.groups ?? [];
  const group = providers.find((candidate) => candidate.id === value.provider);
  const model = group?.models.find((candidate) => candidate.id === value.model);
  const efforts = model?.reasoning?.efforts ?? [];
  const providerListed = group !== undefined;
  const modelListed = model !== undefined;
  const updateModel = (provider: string, modelId: string) => {
    // This is an explicit user change, not a catalog refresh. Clear only this
    // route's adapter-owned effort; do not save or touch the native model default.
    editRoute(path, provider, modelId);
  };
  return <div className="dsmm-route-fields">
    <div className="dsmm-field"><label htmlFor={`${prefix}-provider`}>{t("routeProvider", { name })}</label>
      <select id={`${prefix}-provider`} disabled={disabled} value={providerListed ? value.provider : MANUAL} onChange={(event) => updateModel(event.currentTarget.value === MANUAL ? "" : event.currentTarget.value, "")}>
        <option value={MANUAL}>{providerListed ? t("manual") : t("manualValue", { value: value.provider || t("unset") })}</option>
        {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.id})</option>)}
      </select>
      {!providerListed && <Input aria-label={t("manualProvider", { name })} className="dsmm-input" value={value.provider} disabled={disabled} onChange={(event) => updateModel(event.currentTarget.value, value.model)} />}
    </div>
    <div className="dsmm-field"><label htmlFor={`${prefix}-model`}>{t("routeModel", { name })}</label>
      <select id={`${prefix}-model`} disabled={disabled} value={modelListed ? value.model : MANUAL} onChange={(event) => updateModel(value.provider, event.currentTarget.value === MANUAL ? "" : event.currentTarget.value)}>
        <option value={MANUAL}>{modelListed ? t("manual") : t("manualValue", { value: value.model || t("unset") })}</option>
        {group?.models.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.id})</option>)}
      </select>
      {!modelListed && <Input aria-label={t("manualModel", { name })} className="dsmm-input" value={value.model} disabled={disabled} onChange={(event) => updateModel(value.provider, event.currentTarget.value)} />}
    </div>
    <div className="dsmm-field"><label htmlFor={`${prefix}-effort`}>{t("routeEffort", { name })}</label>
      <select id={`${prefix}-effort`} disabled={disabled} value={value.reasoningEffort ?? ""} onChange={(event) => edit([...path, "reasoningEffort"], event.currentTarget.value || undefined)}>
        <option value="">{t("effortDefault")}</option>
        {value.reasoningEffort !== undefined && !efforts.some((effort) => effort.id === value.reasoningEffort) && <option value={value.reasoningEffort}>{t("manualValue", { value: value.reasoningEffort })}</option>}
        {efforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.name} ({effort.id})</option>)}
      </select>
      <Input aria-label={t("manualEffort", { name })} className="dsmm-input" value={value.reasoningEffort ?? ""} disabled={disabled} placeholder={t("effortDefault")} onChange={(event) => edit([...path, "reasoningEffort"], event.currentTarget.value || undefined)} />
    </div>
  </div>;
}

function PolicyFields({ value, inherited, path, name, disabled, actions, t }: Locale & {
  value: DsmmRuntimePolicyConfig; inherited: DsmmRuntimePolicySettings | undefined; path: JsonPath; name: string; disabled: boolean; actions: ProfilesActions;
}) {
  const prefix = useId();
  return <div className="dsmm-policy-fields">
    <div className="dsmm-field"><label htmlFor={`${prefix}-strategy`}>{t("strategy", { name })}</label>
      <select id={`${prefix}-strategy`} disabled={disabled} value={value.strategy ?? ""} onChange={(event) => actions.editPath([...path, "strategy"], event.currentTarget.value || undefined)}>
        <option value="">{t("inheritStrategy", { value: inherited?.strategy ?? t("unknownDefault") })}</option>
        <option value="startup-lock">{t("startupLock")}</option><option value="rate-limit-fallback">{t("rateFallback")}</option>
      </select>
    </div>
    <p className="dsmm-hint">{t("strategyHint")}</p>
    <div className="dsmm-route-fields">
      {(Object.keys(DSMM_RATE_LIMIT_BOUNDS) as (keyof DsmmRateLimitPolicy)[]).map((field) => <RetryNumber key={field} id={`${prefix}-${field}`} t={t} name={name} field={field} value={value.rateLimit?.[field]} inherited={inherited?.rateLimit[field]} path={[...path, "rateLimit", field]} disabled={disabled} actions={actions} />)}
    </div>
  </div>;
}

/** The same raw draft drives every control; there is no form-to-document rewrite. */
export function StructuredEditor({ state, actions, disabled, t }: Locale & {
  state: ProfilesViewSnapshot; actions: ProfilesActions; disabled: boolean;
}) {
  const prefix = useId();
  const [selectedRole, setSelectedRole] = useState("dsmm-orchestrator");
  const document = state.editor === null ? null : structuredDocument(state.editor.content);
  if (document === null) return <p className="dsmm-hint" data-dsmm-structured-invalid>{t("rawInvalid")}</p>;
  const roles = state.snapshot?.roles ?? [];
  const role = roles.find((candidate) => candidate.id === selectedRole) ?? roles[0];
  const policy = role === undefined ? undefined : document.roleRouting[role.id] ?? {};
  const baseline = state.snapshot?.editorDefaults;
  let inherited: DsmmRuntimePolicySettings | undefined;
  try { if (baseline !== undefined) {
    const profileDefaults = { strategy: document.runtimePolicy.strategy ?? baseline.strategy, rateLimit: normalizeRateLimitPolicy(document.runtimePolicy.rateLimit, baseline.rateLimit) };
    inherited = { strategy: role?.runtimePolicy?.strategy ?? profileDefaults.strategy, rateLimit: normalizeRateLimitPolicy(role?.runtimePolicy?.rateLimit, profileDefaults.rateLimit) };
  } }
  catch { /* Invalid effective values remain a raw/Host validation error. */ }
  const rolePath: JsonPath = ["settings", "roleRouting", role?.id ?? ""];
  return <div className="dsmm-structured" data-dsmm-structured>
    <div className="dsmm-field"><label htmlFor={`${prefix}-label`}>{t("profileLabel")}</label><Input id={`${prefix}-label`} className="dsmm-input" value={document.label ?? ""} disabled={disabled} onChange={(event) => actions.editPath(["label"], event.currentTarget.value || undefined)} /></div>
    <div className="dsmm-field"><label htmlFor={`${prefix}-active`}>{t("defaultActive")}</label><select id={`${prefix}-active`} disabled={disabled} value={document.settings.defaultActive === undefined ? "" : String(document.settings.defaultActive)} onChange={(event) => actions.editPath(["settings", "defaultActive"], event.currentTarget.value === "" ? undefined : event.currentTarget.value === "true")}><option value="">{t("inherit")}</option><option value="true">{t("enabled")}</option><option value="false">{t("disabled")}</option></select><p className="dsmm-hint">{t("activeHint")}</p></div>
    <fieldset><legend>{t("profileDefaults")}</legend><PolicyFields t={t} value={document.runtimePolicy} inherited={baseline} path={["settings", "runtimePolicy"]} name={t("profileDefaults")} disabled={disabled} actions={actions} /></fieldset>
    <div className="dsmm-field"><label htmlFor={`${prefix}-role`}>{t("roleSelect")}</label><select id={`${prefix}-role`} disabled={disabled || roles.length === 0 || state.invalidFields.length > 0} value={role?.id ?? ""} onChange={(event) => setSelectedRole(event.currentTarget.value)}>{roles.length === 0 && <option value="">{t("rolesUnavailable")}</option>}{roles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}{candidate.enabled ? "" : ` — ${t("roleDisabled")}`}</option>)}</select></div>
    {role !== undefined && policy !== undefined && <fieldset data-dsmm-role={role.id}><legend>{role.label}</legend>
      <p className="dsmm-hint">{t(role.enabled ? "roleEnabled" : "roleDisabled")}</p>
      <PolicyFields t={t} value={policy} inherited={inherited} path={rolePath} name={role.label} disabled={disabled} actions={actions} />
      <div className="dsmm-field"><label htmlFor={`${prefix}-primary-mode`}>{t("primaryMode", { name: role.label })}</label><select id={`${prefix}-primary-mode`} disabled={disabled} value={policy.primary === undefined ? "inherit" : "explicit"} onChange={(event) => actions.editPath([...rolePath, "primary"], event.currentTarget.value === "inherit" ? undefined : { provider: "", model: "" })}><option value="inherit">{t("inheritRoute")}</option><option value="explicit">{t("configuredRoute")}</option></select></div>
      {policy.primary !== undefined && <RouteFields t={t} value={policy.primary} path={[...rolePath, "primary"]} name={t("primaryName", { name: role.label })} catalog={state.catalog} disabled={disabled} edit={actions.editPath} editRoute={actions.editRoute} />}
      <p className="dsmm-hint">{t("effortChangeHint")}</p>
      <div className="dsmm-field"><label htmlFor={`${prefix}-fallback-mode`}>{t("fallbackMode", { name: role.label })}</label><select id={`${prefix}-fallback-mode`} disabled={disabled} value={policy.fallbackRoutes === undefined ? "inherit" : "explicit"} onChange={(event) => actions.editPath([...rolePath, "fallbackRoutes"], event.currentTarget.value === "inherit" ? undefined : [])}><option value="inherit">{t("inheritChain")}</option><option value="explicit">{t("configuredChain")}</option></select></div>
      {policy.fallbackRoutes?.length === 0 && <p className="dsmm-hint">{t("emptyChain")}</p>}
      {policy.fallbackRoutes?.map((candidate, index) => {
        const name = t("fallbackName", { name: role.label, index: index + 1 });
        return <fieldset key={index}><legend>{name}</legend><RouteFields t={t} value={candidate} path={[...rolePath, "fallbackRoutes", index]} name={name} catalog={state.catalog} disabled={disabled} edit={actions.editPath} editRoute={actions.editRoute} />
          <div className="dsmm-actions"><Button type="button" variant="outline" disabled={disabled || index === 0} onClick={() => actions.moveFallback(role.id, index, index - 1)}>{t("moveUp", { name })}</Button><Button type="button" variant="outline" disabled={disabled || index === policy.fallbackRoutes!.length - 1} onClick={() => actions.moveFallback(role.id, index, index + 1)}>{t("moveDown", { name })}</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => actions.editPath([...rolePath, "fallbackRoutes", index], undefined)}>{t("removeFallback", { name })}</Button></div>
        </fieldset>;
      })}
      <Button type="button" variant="outline" disabled={disabled || (policy.fallbackRoutes?.length ?? 0) >= 32} onClick={() => {
        if (policy.fallbackRoutes === undefined) actions.editPath([...rolePath, "fallbackRoutes"], [{ provider: "", model: "" }]);
        else actions.editPath([...rolePath, "fallbackRoutes", policy.fallbackRoutes.length], { provider: "", model: "" });
      }}>{t("addFallback", { name: role.label })}</Button>
    </fieldset>}
  </div>;
}
