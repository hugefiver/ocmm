import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DSMM_ROLES, renderAgentCordis, renderPresetMetadata } from "./roles.js";
import { isRoleEnabled } from "./settings.js";
export const DSMM_MANAGED_PRESET_MARKER = ".dsmm-managed-preset";
export function resolveManagedPresetRoot(settings, env = process.env) {
    if (settings.presets.root !== undefined)
        return settings.presets.root;
    const dshHome = env.DSH_HOME;
    return dshHome === undefined || dshHome.length === 0 ? undefined : join(dshHome, ".agent-presets");
}
export function materializeRolePresets(options) {
    reconcileRolePresets({
        root: options.root,
        settings: {
            ...options.settings,
            presets: { ...options.settings.presets, materialize: true }
        }
    });
}
export function reconcileRolePresets({ root, settings }) {
    if (root.length === 0) {
        throw new Error("dsmm preset materialization root must not be empty");
    }
    if (!settings.presets.materialize) {
        removeAllManagedPresetDirectories(root);
        return;
    }
    mkdirSync(root, { recursive: true });
    for (const role of DSMM_ROLES) {
        const presetDirectory = join(root, role.id);
        if (isRoleEnabled(settings, role.id)) {
            mkdirSync(presetDirectory, { recursive: true });
            writeFileSync(join(presetDirectory, "agent.cordis.yml"), renderAgentCordis(role), "utf8");
            writeFileSync(join(presetDirectory, "preset.yml"), renderPresetMetadata(role), "utf8");
            writeFileSync(join(presetDirectory, DSMM_MANAGED_PRESET_MARKER), "managed by dsmm\n", "utf8");
        }
        else {
            removeDirectoryIfManaged(presetDirectory);
        }
    }
}
function removeAllManagedPresetDirectories(root) {
    if (!existsSync(root))
        return;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory())
            removeDirectoryIfManaged(join(root, entry.name));
    }
}
function removeDirectoryIfManaged(directory) {
    if (!isManagedDirectory(directory))
        return;
    rmSync(directory, { recursive: true, force: true });
}
function isManagedDirectory(directory) {
    if (!existsSync(directory))
        return false;
    if (!statSync(directory).isDirectory())
        return false;
    const marker = join(directory, DSMM_MANAGED_PRESET_MARKER);
    return existsSync(marker) && statSync(marker).isFile();
}
//# sourceMappingURL=preset-materializer.js.map