import { createHash } from "node:crypto";
import { Context } from "@deepseek-ai/cordis";
import { parseTree } from "jsonc-parser";
import type { Node, ParseError } from "jsonc-parser";
import type { DshContext } from "./dsh-types.js";
import { resolveDshHome } from "./dsh-home.js";
import { FixedConfigFileStore } from "./config-file-store.js";
import { copyJson, freezeSettings, resolveDeployment, validateDeploymentPath, validateSparseConfig } from "./settings.js";
import type { DsmmDeploymentSnapshot, DsmmPluginConfig } from "./settings.js";
import { DsmmProfileError } from "./profiles.js";
import { resolve } from "node:path";

export type DeploymentPathEdit = { op: "set"; path: string[]; value: unknown } | { op: "unset"; path: string[] };
export interface GlobalConfigSaveRequest { expectedRevision: string; edits: DeploymentPathEdit[] }
export interface GlobalConfigSnapshot { config: DsmmPluginConfig; revision: string }

function configurationError(): never { throw new DsmmProfileError("validation", "Deepwork deployment configuration is invalid; restore valid plain JSON before saving or admitting a new session."); }

function validateJsonTree(node: Node, depth = 0): void {
  if (depth > 64) configurationError();
  if (node.type === "object") {
    const names = (node.children ?? []).map((property) => property.children?.[0]?.value as unknown);
    if (new Set(names).size !== names.length) configurationError();
  }
  for (const child of node.children ?? []) validateJsonTree(child, depth + 1);
}
export function parseGlobalConfig(content: string | null): DsmmPluginConfig {
  if (content === null) return {};
  const errors: ParseError[] = [];
  const tree = parseTree(content, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (tree?.type !== "object" || errors.length > 0) configurationError();
  validateJsonTree(tree);
  try { return validateSparseConfig(JSON.parse(content), true); } catch { return configurationError(); }
}

/** Only schema fields, never filesystem paths or array indexes. Full candidate is revalidated. */
export function editGlobalConfig(config: DsmmPluginConfig, edits: DeploymentPathEdit[]): DsmmPluginConfig {
  let result = copyJson(config) as Record<string, unknown>;
  if (!Array.isArray(edits) || edits.length > 128) configurationError();
  for (const input of edits) {
    const edit = copyJson(input);
    if (edit === null || typeof edit !== "object" || !["set", "unset"].includes(edit.op)
      || Object.keys(edit).some((key) => !["op", "path", ...edit.op === "set" ? ["value"] : []].includes(key))
      || edit.op === "set" && !Object.hasOwn(edit, "value")
      || !Array.isArray(edit.path) || edit.path.length === 0 || edit.path.length > 8
      || edit.path.some((key) => typeof key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/u.test(key) || ["constructor", "prototype", "__proto__"].includes(key))) configurationError();
    try { validateDeploymentPath(edit.path); } catch { configurationError(); }
    let node = result;
    for (const key of edit.path.slice(0, -1)) {
      const child = node[key];
      if (child !== undefined && (child === null || typeof child !== "object" || Array.isArray(child))) configurationError();
      node = (node[key] ??= {}) as Record<string, unknown>;
    }
    const key = edit.path.at(-1)!;
    if (edit.op === "set") node[key] = copyJson(edit.value);
    else Reflect.deleteProperty(node, key);
    try { result = validateSparseConfig(result, true) as Record<string, unknown>; } catch { configurationError(); }
  }
  return result as DsmmPluginConfig;
}

function hash(input: unknown): string { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
function presentValue(parsed: unknown, raw: unknown): unknown {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    if (parsed === null || typeof parsed !== "object") configurationError();
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, presentValue(Reflect.get(parsed, key), value)]));
  }
  return copyJson(parsed);
}
function sources(global: DsmmPluginConfig, profile: DsmmPluginConfig, settings: unknown): DsmmDeploymentSnapshot["sources"] {
  const result: DsmmDeploymentSnapshot["sources"] = {};
  const walk = (value: unknown, path: string[], lower: unknown, upper: unknown): void => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) walk(child, [...path, key], lower !== null && typeof lower === "object" ? Reflect.get(lower, key) : undefined, upper !== null && typeof upper === "object" ? Reflect.get(upper, key) : undefined);
    } else result[path.join(".")] = upper !== undefined ? "profile" : lower !== undefined ? "global" : "defaults";
  };
  walk(settings, [], global, profile);
  if (global.workflow?.policy === undefined && profile.workflow?.policy === undefined) {
    const legacyControls = (config: DsmmPluginConfig): boolean => ["strictGates", "reviewCap", "finalReviewPolicy"].some((key) => config.workflow !== undefined && Object.hasOwn(config.workflow, key));
    if (legacyControls(profile)) result["workflow.policy"] = "profile";
    else if (legacyControls(global)) result["workflow.policy"] = "global";
  }
  return result;
}

/** One native entry's desired reader and one fixed global base; no scheduler or mirror. */
export class DsmmDeploymentConfig {
  readonly home: string;
  readonly store: FixedConfigFileStore;
  readonly entryId: string;
  readonly hostProfileKey: string;
  constructor(private readonly ctx: DshContext, private readonly config: DsmmPluginConfig) {
    const profile = ctx.get?.<{ home?: string; dir?: string }>("profileContext");
    this.home = resolveDshHome(profile?.home);
    this.store = new FixedConfigFileStore(this.home);
    const entry = ctx instanceof Context ? ctx.fiber.entry : undefined;
    this.entryId = entry?.id ?? "trusted-direct";
    const identity = profile?.dir === undefined ? "trusted-direct" : resolve(profile.dir);
    this.hostProfileKey = hash([process.platform === "win32" ? identity.toLowerCase() : identity, this.entryId]);
  }

  private profile(): { config: DsmmPluginConfig; revision: string } {
    const entry = this.ctx instanceof Context ? this.ctx.fiber.entry : undefined;
    const raw: unknown = entry === undefined ? Object.fromEntries(Object.entries(this.config).flatMap(([key, parsed]) => {
      const value = parsed !== null && typeof parsed === "object" && "get" in parsed && typeof parsed.get === "function" ? parsed.get() : parsed;
      return value === undefined ? [] : [[key, value]];
    })) : entry.options.config ?? {};
    try {
      const presence = validateSparseConfig(raw);
      const snapshot: Record<string, unknown> = {};
      for (const key of Object.keys(presence)) {
        const parsed = Reflect.get(this.config, key) as unknown;
        const value = parsed !== null && typeof parsed === "object" && "get" in parsed && typeof parsed.get === "function" ? parsed.get() : parsed;
        snapshot[key] = presentValue(value, Reflect.get(presence, key));
      }
      return { config: validateSparseConfig(snapshot), revision: hash(presence) };
    } catch { return configurationError(); }
  }

  async readGlobal(): Promise<GlobalConfigSnapshot> {
    const file = await this.store.read();
    return { config: parseGlobalConfig(file.content), revision: file.revision };
  }
  async readDesired(): Promise<DsmmDeploymentSnapshot> {
    const profile = this.profile();
    const global = await this.readGlobal();
    let settings;
    try { settings = resolveDeployment(global.config, profile.config); } catch { return configurationError(); }
    const entry = this.ctx instanceof Context ? this.ctx.fiber.entry : undefined;
    const descriptor = entry === undefined ? undefined : this.ctx.get?.<{ describe(options?: { redactSecrets: boolean }): Array<{ ns: string; revision: number; base?: unknown; user?: unknown }> }>("settings")?.describe({ redactSecrets: true }).find((row) => row.ns === entry.options.id);
    if (this.profile().revision !== profile.revision || this.store.read().revision !== global.revision) throw new DsmmProfileError("conflict", "Deployment sources changed while projecting native state; refresh before retrying.");
    return freezeSettings({ settings, global: global.config, profile: profile.config, globalRevision: global.revision, nativeRevision: profile.revision,
      entryId: this.entryId, hostProfileKey: this.hostProfileKey, ...(entry === undefined ? {} : { nativeNamespace: entry.options.id }),
      ...(descriptor === undefined ? {} : { nativeFormRevision: descriptor.revision, nativeForm: {
        ...(descriptor.base === undefined ? {} : { base: descriptor.base }), ...(descriptor.user === undefined ? {} : { user: descriptor.user })
      } }), sources: sources(global.config, profile.config, settings) });
  }
  async saveGlobal(request: GlobalConfigSaveRequest, assertAuthority: () => void): Promise<GlobalConfigSnapshot> {
    assertAuthority();
    const current = await this.readGlobal();
    if (current.revision !== request.expectedRevision) throw new DsmmProfileError("conflict", "The global base changed; refresh before saving.");
    const config = editGlobalConfig(current.config, request.edits);
    try { resolveDeployment(config, this.profile().config); } catch { configurationError(); }
    const saved = await this.store.save(`${JSON.stringify(config, null, 2)}\n`, request.expectedRevision, assertAuthority);
    return { config, revision: saved.revision };
  }
}
