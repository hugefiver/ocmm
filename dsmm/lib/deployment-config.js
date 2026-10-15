import { createHash } from "node:crypto";
import { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "./dsh-home.js";
import { FixedConfigFileStore } from "./config-file-store.js";
import { copyJson, freezeSettings, resolveDeployment, validateDeploymentPath, validateSparseConfig } from "./settings.js";
import { DsmmProfileError } from "./profiles.js";
import { resolve } from "node:path";
import { diagnosticSourcePath, DsmmConfigValidationError, fieldLocation, inspectJsonDocument } from "./profile-diagnostics.js";
import { parseHostNativeCommands } from "./permission-native-command.js";
function configurationError() { throw new DsmmProfileError("validation", "Deepwork deployment configuration is invalid; restore valid plain JSON before saving or admitting a new session."); }
export function parseGlobalConfig(content) {
    if (content === null)
        return {};
    const inspected = inspectJsonDocument(content, false);
    const issue = inspected.diagnostics[0];
    if (issue !== undefined)
        throw new DsmmProfileError("validation", `${issue.field}: ${issue.reason}`, issue.field, issue.code, issue.location);
    if (inspected.tree?.type !== "object")
        configurationError();
    try {
        const config = validateSparseConfig(JSON.parse(content), true);
        if (config.permissionControl?.nativeCommands !== undefined)
            parseHostNativeCommands(config.permissionControl.nativeCommands);
        return config;
    }
    catch (error) {
        if (error instanceof DsmmConfigValidationError)
            throw new DsmmProfileError("validation", error.message, error.diagnostic.field, error.diagnostic.code, fieldLocation(content, inspected.tree, error.diagnostic.field, diagnosticSourcePath(error)));
        return configurationError();
    }
}
/** Only schema fields, never filesystem paths or array indexes. Full candidate is revalidated. */
export function editGlobalConfig(config, edits) {
    let result = copyJson(config);
    if (!Array.isArray(edits) || edits.length > 128)
        configurationError();
    for (const input of edits) {
        const edit = copyJson(input);
        if (edit === null || typeof edit !== "object" || !["set", "unset"].includes(edit.op)
            || Object.keys(edit).some((key) => !["op", "path", ...edit.op === "set" ? ["value"] : []].includes(key))
            || edit.op === "set" && !Object.hasOwn(edit, "value")
            || !Array.isArray(edit.path) || edit.path.length === 0 || edit.path.length > 8
            || edit.path.some((key) => typeof key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/u.test(key) || ["constructor", "prototype", "__proto__"].includes(key)))
            configurationError();
        validateDeploymentPath(edit.path);
        let node = result;
        for (const key of edit.path.slice(0, -1)) {
            const child = node[key];
            if (child !== undefined && (child === null || typeof child !== "object" || Array.isArray(child)))
                configurationError();
            node = (node[key] ??= {});
        }
        const key = edit.path.at(-1);
        if (edit.op === "set")
            node[key] = copyJson(edit.value);
        else
            Reflect.deleteProperty(node, key);
        result = validateSparseConfig(result, true);
    }
    const configResult = result;
    if (configResult.permissionControl?.nativeCommands !== undefined)
        parseHostNativeCommands(configResult.permissionControl.nativeCommands);
    return configResult;
}
function hash(input) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
function presentValue(parsed, raw) {
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        if (parsed === null || typeof parsed !== "object")
            configurationError();
        return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, presentValue(Reflect.get(parsed, key), value)]));
    }
    return copyJson(parsed);
}
function sources(global, profile, settings) {
    const result = {};
    const walk = (value, path, lower, upper) => {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            for (const [key, child] of Object.entries(value))
                walk(child, [...path, key], lower !== null && typeof lower === "object" ? Reflect.get(lower, key) : undefined, upper !== null && typeof upper === "object" ? Reflect.get(upper, key) : undefined);
        }
        else
            result[path.join(".")] = upper !== undefined ? "profile" : lower !== undefined ? "global" : "defaults";
    };
    walk(settings, [], global, profile);
    if (global.workflow?.policy === undefined && profile.workflow?.policy === undefined) {
        const legacyControls = (config) => ["strictGates", "reviewCap", "finalReviewPolicy"].some((key) => config.workflow !== undefined && Object.hasOwn(config.workflow, key));
        if (legacyControls(profile))
            result["workflow.policy"] = "profile";
        else if (legacyControls(global))
            result["workflow.policy"] = "global";
    }
    return result;
}
/** One native entry's desired reader and one fixed global base; no scheduler or mirror. */
export class DsmmDeploymentConfig {
    ctx;
    config;
    writeCoordinator;
    home;
    store;
    entryId;
    hostProfileKey;
    get nativeEntry() { return Context.is(this.ctx) ? this.ctx.fiber.entry : undefined; }
    coordinateWrites(coordinator) {
        if (this.writeCoordinator !== undefined)
            throw new DsmmProfileError("conflict", "Deployment writes already have an owner.");
        this.writeCoordinator = coordinator;
        return () => { if (this.writeCoordinator === coordinator)
            this.writeCoordinator = undefined; };
    }
    /** Synchronous source identity for permission dispatch fences; no form revision or process identity. */
    permissionSource() {
        const profile = this.profile(), file = this.store.read(), global = parseGlobalConfig(file.content);
        const settings = resolveDeployment(global, profile.config);
        return freezeSettings({ revision: hash([this.hostProfileKey, file.revision, profile.revision, profile.config]),
            globalRevision: file.revision, nativeRevision: profile.revision, global, profile: profile.config,
            policy: { ...settings.permissionControl, nativeCommands: parseHostNativeCommands(settings.permissionControl.nativeCommands) } });
    }
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        const profile = ctx.get?.("profileContext");
        this.home = resolveDshHome(profile?.home);
        this.store = new FixedConfigFileStore(this.home);
        const entry = Context.is(ctx) ? ctx.fiber.entry : undefined;
        this.entryId = entry?.id ?? "trusted-direct";
        const identity = profile?.dir === undefined ? "trusted-direct" : resolve(profile.dir);
        this.hostProfileKey = hash([process.platform === "win32" ? identity.toLowerCase() : identity, this.entryId]);
    }
    profile() {
        const entry = Context.is(this.ctx) ? this.ctx.fiber.entry : undefined;
        const raw = entry === undefined ? Object.fromEntries(Object.entries(this.config).flatMap(([key, parsed]) => {
            const value = parsed !== null && typeof parsed === "object" && "get" in parsed && typeof parsed.get === "function" ? parsed.get() : parsed;
            return value === undefined ? [] : [[key, value]];
        })) : entry.options.config ?? {};
        try {
            const presence = validateSparseConfig(raw);
            const snapshot = {};
            for (const key of Object.keys(presence)) {
                const parsed = Reflect.get(this.config, key);
                const value = parsed !== null && typeof parsed === "object" && "get" in parsed && typeof parsed.get === "function" ? parsed.get() : parsed;
                snapshot[key] = presentValue(value, Reflect.get(presence, key));
            }
            const config = validateSparseConfig(snapshot);
            if (config.permissionControl?.nativeCommands !== undefined)
                parseHostNativeCommands(config.permissionControl.nativeCommands);
            return { config, revision: hash(presence) };
        }
        catch (error) {
            if (error instanceof DsmmConfigValidationError)
                throw error;
            return configurationError();
        }
    }
    async readGlobal() {
        const file = await this.store.read();
        return { config: parseGlobalConfig(file.content), revision: file.revision };
    }
    async readDesired() {
        const profile = this.profile();
        const global = await this.readGlobal();
        let settings;
        try {
            settings = resolveDeployment(global.config, profile.config);
        }
        catch (error) {
            if (error instanceof DsmmConfigValidationError)
                throw error;
            return configurationError();
        }
        const entry = Context.is(this.ctx) ? this.ctx.fiber.entry : undefined;
        const descriptor = entry === undefined ? undefined : this.ctx.get?.("settings")?.describe({ redactSecrets: true }).find((row) => row.ns === entry.options.id);
        if (this.profile().revision !== profile.revision || this.store.read().revision !== global.revision)
            throw new DsmmProfileError("conflict", "Deployment sources changed while projecting native state; refresh before retrying.");
        return freezeSettings({ settings, global: global.config, profile: profile.config, globalRevision: global.revision, nativeRevision: profile.revision,
            entryId: this.entryId, hostProfileKey: this.hostProfileKey, ...(entry === undefined ? {} : { nativeNamespace: entry.options.id }),
            ...(descriptor === undefined ? {} : { nativeFormRevision: descriptor.revision, nativeForm: {
                    ...(descriptor.base === undefined ? {} : { base: descriptor.base }), ...(descriptor.user === undefined ? {} : { user: descriptor.user })
                } }), sources: sources(global.config, profile.config, settings) });
    }
    async saveGlobal(request, assertAuthority) {
        assertAuthority();
        const current = await this.readGlobal();
        if (current.revision !== request.expectedRevision)
            throw new DsmmProfileError("conflict", "The global base changed; refresh before saving.");
        const config = editGlobalConfig(current.config, request.edits);
        try {
            resolveDeployment(config, this.profile().config);
        }
        catch (error) {
            if (error instanceof DsmmConfigValidationError)
                throw error;
            configurationError();
        }
        const write = async (candidate) => {
            const validated = validateSparseConfig(candidate, true);
            resolveDeployment(validated, this.profile().config);
            assertAuthority();
            const saved = await this.store.save(`${JSON.stringify(validated, null, 2)}\n`, request.expectedRevision, assertAuthority);
            return { config: validated, revision: saved.revision };
        };
        return this.writeCoordinator === undefined ? write(config) : this.writeCoordinator.global(request, config, assertAuthority, write);
    }
}
//# sourceMappingURL=deployment-config.js.map