import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// This content-only dependency must not import settings or model routing:
// roles need it during ESM initialization, including prompts-first imports.
const sourceRoot = join(dirname(dirname(fileURLToPath(import.meta.url))), "prompts", "source");
const assets = new Map();
export function readPromptAsset(path) {
    let text = assets.get(path);
    if (text === undefined) {
        text = readFileSync(join(sourceRoot, path), "utf8").trim();
        assets.set(path, text);
    }
    return text;
}
export const SOURCE_ROLE_CATALOG = JSON.parse(readPromptAsset("catalog.json"));
export function splitCategory(text) {
    const calibrations = new Map();
    const base = text.replace(/\r?\n?<model-calibration model="([^"]+)">\r?\n([\s\S]*?)\r?\n<\/model-calibration>\r?\n?/gu, (_block, model, calibration) => { calibrations.set(model, calibration.trim()); return "\n"; }).trim();
    return { base, calibrations };
}
export function buildRolePersona(role) {
    const source = role.promptArtifact === null ? role.description : readPromptAsset(role.promptArtifact.replace("prompts/source/", ""));
    const body = role.kind === "category" ? splitCategory(source).base : source;
    return [`You are ${role.name} (role ID: ${role.id}).`, role.mode === "primary" || role.mode === "all" ? readPromptAsset("shared/locale.md") : "", body, readPromptAsset("shared/dsh-host-contract.md"), readPromptAsset(role.terminalArtifact.replace("prompts/source/", ""))].filter(Boolean).join("\n\n---\n\n");
}
//# sourceMappingURL=prompt-content.js.map